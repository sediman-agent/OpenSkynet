"""
Background Worker for System 2 Memory.

Runs System2 consolidation pipeline via cron/scheduler.
"""

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

from .store import HyMemoryStore
from .schemer import SchemaAbstractor
from .intenter import IntentPredictor
from .chain import ChainTracer

logger = logging.getLogger(__name__)


class BackgroundSystem2Worker:
    """Background worker for System 2 consolidation.

    Runs L5 (SCHEMA) and L6 (INTENTION) processing asynchronously.
    """

    def __init__(
        self,
        store: HyMemoryStore,
        schemer: Optional[SchemaAbstractor] = None,
        intenter: Optional[IntentPredictor] = None,
    ):
        """Initialize the background worker.

        Args:
            store: HyMemoryStore instance
            schemer: SchemaAbstractor instance
            intenter: IntentPredictor instance
        """
        self.store = store
        self.schemer = schemer or SchemaAbstractor()
        self.intenter = intenter or IntentPredictor()
        self.chain_tracer = ChainTracer()

    async def run_consolidation(
        self,
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Run full System2 consolidation pipeline.

        Args:
            session_id: Optional session filter

        Returns:
            Dictionary with consolidation results
        """
        start_time = datetime.now()
        logger.info("Starting System2 consolidation")

        results = {
            "started_at": start_time.isoformat(),
            "session_id": session_id,
        }

        try:
            # Run L5 Schema abstraction
            schema_results = await self.schemer.run_batch(self.store, session_id)
            results["schemas"] = schema_results

            # Run L6 Intention prediction
            intention_results = await self.intenter.run_batch(
                self.store, session_id
            )
            results["intentions"] = intention_results

            # Consolidate evolution chains
            chain_results = await self.consolidate_chains()
            results["chains"] = chain_results

            # Prune expired intentions
            pruned = await self.intenter.prune_expired_intentions(self.store)
            results["pruned_intentions"] = pruned

            end_time = datetime.now()
            duration = (end_time - start_time).total_seconds()

            results["completed_at"] = end_time.isoformat()
            results["duration_seconds"] = duration
            results["success"] = True

            logger.info(
                f"System2 consolidation completed in {duration:.2f}s"
            )

        except Exception as e:
            logger.error(f"System2 consolidation failed: {e}", exc_info=True)
            results["success"] = False
            results["error"] = str(e)

        return results

    async def consolidate_chains(
        self,
        max_depth: int = 10,
        max_age_days: int = 90,
    ) -> Dict[str, Any]:
        """Consolidate evolution chains.

        Args:
            max_depth: Maximum chain depth before compression
            max_age_days: Maximum age for chain retention

        Returns:
            Dictionary with consolidation results
        """
        results = {
            "chains_processed": 0,
            "chains_compressed": 0,
            "chains_archived": 0,
        }

        try:
            # Get all preferences and identities (most likely to have chains)
            from .models import MemType

            preferences = await self.store.query_by_type(
                MemType.PREFERENCE, limit=100
            )
            identities = await self.store.query_by_type(
                MemType.IDENTITY, limit=50
            )

            all_chained = preferences + identities

            for record in all_chained:
                if not record.supersedes:
                    continue

                results["chains_processed"] += 1

                # Trace chain
                chain = await self.chain_tracer.trace_chain(
                    record.id,
                    self.store.get_record,
                    max_depth=max_depth,
                )

                if len(chain) > max_depth:
                    # Compress chain
                    await self._compress_chain(chain, max_depth)
                    results["chains_compressed"] += 1

                # Check for archiving
                await self._maybe_archive_chain(record, max_age_days, results)

        except Exception as e:
            logger.error(f"Chain consolidation failed: {e}")

        return results

    async def _compress_chain(
        self,
        chain: List,
        target_depth: int,
    ) -> None:
        """Compress a long chain to target depth.

        Args:
            chain: Chain records
            target_depth: Target depth
        """
        # Keep the most recent N records
        to_keep = chain[-target_depth:]
        to_remove = chain[:-target_depth]

        # Mark old records as archived
        for record in to_remove:
            record.metadata = record.metadata or {}
            record.metadata["archived"] = True
            record.metadata["archived_reason"] = "Chain compression"
            record.metadata["archived_at"] = datetime.now().isoformat()
            await self.store.update_record(record)

        logger.info(f"Compressed chain from {len(chain)} to {len(to_keep)}")

    async def _maybe_archive_chain(
        self,
        record,
        max_age_days: int,
        results: Dict[str, Any],
    ) -> None:
        """Archive chain if too old.

        Args:
            record: Chain record
            max_age_days: Maximum age in days
            results: Results dictionary to update
        """
        from datetime import timedelta

        cutoff = datetime.now() - timedelta(days=max_age_days)

        if record.updated_at < cutoff and record.access_count < 2:
            # Low activity and old, archive
            record.metadata = record.metadata or {}
            record.metadata["archived"] = True
            record.metadata["archived_reason"] = "Old and low activity"
            record.metadata["archived_at"] = datetime.now().isoformat()
            await self.store.update_record(record)
            results["chains_archived"] += 1

    async def get_worker_stats(self) -> Dict[str, Any]:
        """Get statistics about background processing.

        Returns:
            Dictionary with worker stats
        """
        store_stats = await self.store.get_stats()

        # Get recent L5 and L6 records
        from .models import Layer, MemType

        recent_schemas = await self.store.query_recent(limit=10, layer=Layer.SCHEMA)
        recent_intentions = await self.store.query_recent(
            limit=10, layer=Layer.INTENTION
        )

        return {
            **store_stats,
            "recent_schemas": len(recent_schemas),
            "recent_intentions": len(recent_intentions),
            "active_intentions": len(
                await self.intender.get_active_intentions(self.store)
            ),
        }

    async def health_check(self) -> Dict[str, Any]:
        """Check worker health status.

        Returns:
            Dictionary with health status
        """
        try:
            # Test store connection
            stats = await self.store.get_stats()

            return {
                "healthy": True,
                "store_connected": stats is not None,
                "schemer_available": self.schemer is not None,
                "intender_available": self.intender is not None,
                "timestamp": datetime.now().isoformat(),
            }
        except Exception as e:
            return {
                "healthy": False,
                "error": str(e),
                "timestamp": datetime.now().isoformat(),
            }


class ConsolidationScheduler:
    """Schedules and manages consolidation jobs."""

    def __init__(self, worker: BackgroundSystem2Worker):
        """Initialize the scheduler.

        Args:
            worker: Background worker instance
        """
        self.worker = worker
        self.last_run = None
        self.next_run = None

    async def schedule_consolidation(
        self,
        interval_minutes: int = 30,
    ) -> str:
        """Schedule periodic consolidation.

        Args:
            interval_minutes: Interval between runs

        Returns:
            Job ID
        """
        # In production, this would register with CronScheduler
        # For now, return a mock job ID
        job_id = f"hy_consolidation_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        logger.info(
            f"Scheduled consolidation job {job_id} every {interval_minutes} minutes"
        )

        return job_id

    async def trigger_now(self) -> Dict[str, Any]:
        """Trigger immediate consolidation.

        Returns:
            Consolidation results
        """
        return await self.worker.run_consolidation()

    def get_status(self) -> Dict[str, Any]:
        """Get scheduler status.

        Returns:
            Dictionary with status
        """
        return {
            "last_run": self.last_run.isoformat() if self.last_run else None,
            "next_run": self.next_run.isoformat() if self.next_run else None,
            "worker_available": self.worker is not None,
        }
