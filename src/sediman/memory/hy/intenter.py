"""
Intent Predictor for System 2 Memory.

Creates L6 INTENTION layer records by predicting future intents.
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

from .models import MemoryRecord, Layer, MemType

logger = logging.getLogger(__name__)


class IntentPredictor:
    """Predicts future intents from behavior patterns (L6 INTENTION).

    Analyzes past behaviors and current context to predict likely
    future actions or requests.
    """

    INTENTION_PROMPT = """Based on this user's history and current context, predict likely future intents:

Recent behaviors and preferences:
{history}

Current context:
{context}

Predict what this user is likely to want or do next. Be specific but realistic.

Respond with JSON:
{{
    "intentions": [
        {{
            "description": "likely next action or request",
            "confidence": 0.8,
            "timeframe": "immediate|short-term|long-term",
            "evidence": ["fact 1", "fact 2"]
        }}
    ]
}}

Examples:
- "Will likely ask for healthy Japanese restaurant recommendations"
- "Planning to start a new fitness routine, may ask for workout advice"
- "Considering career change, may seek information about tech industry"
"""

    def __init__(self, llm_provider: Optional[Any] = None):
        """Initialize the intent predictor.

        Args:
            llm_provider: LLM provider for prediction
        """
        self.llm_provider = llm_provider

    async def predict_intentions(
        self,
        store,
        session_id: Optional[str] = None,
        limit: int = 5,
    ) -> List[MemoryRecord]:
        """Predict future intents from accumulated memories.

        Args:
            store: Memory store
            session_id: Optional session filter
            limit: Maximum intentions to create

        Returns:
            List of intention records
        """
        # Gather context
        context = await self._gather_context(store, session_id)

        if not context:
            logger.info("Insufficient data for intent prediction")
            return []

        # Predict intentions
        if not self.llm_provider:
            return await self._heuristic_predict(context, store, limit)

        return await self._llm_predict(context, store, limit)

    async def _gather_context(
        self,
        store,
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Gather context for prediction.

        Args:
            store: Memory store
            session_id: Optional session filter

        Returns:
            Dictionary with context data
        """
        # Get recent memories
        recent = await store.query_recent(limit=30)

        # Get preferences and identities
        preferences = await store.query_by_type(MemType.PREFERENCE, limit=20)
        identities = await store.query_by_type(MemType.IDENTITY, limit=15)

        # Get schemas if available
        schemas = await store.query_by_layer(Layer.SCHEMA, limit=10)

        return {
            "recent_memories": [r.content for r in recent],
            "preferences": [p.content for p in preferences],
            "identities": [i.content for i in identities],
            "schemas": [s.content for s in schemas],
        }

    async def _llm_predict(
        self,
        context: Dict[str, Any],
        store,
        limit: int,
    ) -> List[MemoryRecord]:
        """Use LLM to predict intentions.

        Args:
            context: Context data
            store: Memory store
            limit: Maximum intentions

        Returns:
            List of intention records
        """
        try:
            # Format context
            history_text = "\n".join(
                context.get("preferences", [])[:10]
                + context.get("identities", [])[:8]
            )
            context_text = "\n".join(context.get("recent_memories", [])[:15])

            prompt = self.INTENTION_PROMPT.format(
                history=history_text[:1000],
                context=context_text[:800],
            )

            response = await self.llm_provider(
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.5,
                max_tokens=600,
            )

            import json

            data = json.loads(response.content.strip())
            intentions_data = data.get("intentions", [])

            # Create intention records
            intentions = []
            for intent_data in intentions_data[:limit]:
                intention = MemoryRecord.create(
                    layer=Layer.INTENTION,
                    mem_type=MemType.INTENTION,
                    content=intent_data.get("description", ""),
                    confidence=intent_data.get("confidence", 0.6),
                    metadata={
                        "timeframe": intent_data.get("timeframe", "short-term"),
                        "evidence": intent_data.get("evidence", []),
                        "predicted_at": datetime.now().isoformat(),
                        "expires_at": (
                            datetime.now() + timedelta(days=7)
                        ).isoformat(),
                    },
                )
                await store.add_record(intention)
                intentions.append(intention)

            logger.info(f"Created {len(intentions)} intentions via LLM")
            return intentions

        except Exception as e:
            logger.error(f"LLM intent prediction failed: {e}")
            return []

    async def _heuristic_predict(
        self,
        context: Dict[str, Any],
        store,
        limit: int,
    ) -> List[MemoryRecord]:
        """Fallback heuristic intent prediction.

        Args:
            context: Context data
            store: Memory store
            limit: Maximum intentions

        Returns:
            List of intention records
        """
        intentions = []

        # Simple intent detection from recent memories
        recent = context.get("recent_memories", [])

        # Look for intention-indicating phrases
        intention_keywords = {
            "想": ("wants to", "immediate"),
            "想要": ("wants to", "immediate"),
            "打算": ("plans to", "short-term"),
            "准备": ("preparing to", "immediate"),
            "考虑": ("considering", "short-term"),
            "want": ("wants to", "immediate"),
            "plan": ("plans to", "short-term"),
            "thinking about": ("considering", "short-term"),
        }

        for memory in recent[:limit]:
            for keyword, (phrase, timeframe) in intention_keywords.items():
                if keyword in memory.lower():
                    intention = MemoryRecord.create(
                        layer=Layer.INTENTION,
                        mem_type=MemType.INTENTION,
                        content=f"User {phrase}: {memory}",
                        confidence=0.5,
                        metadata={
                            "timeframe": timeframe,
                            "source_memory": memory,
                            "method": "heuristic",
                        },
                    )
                    await store.add_record(intention)
                    intentions.append(intention)
                    break

        logger.info(f"Created {len(intentions)} intentions via heuristic")
        return intentions

    async def run_batch(
        self,
        store,
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Run intent prediction batch job.

        Args:
            store: Memory store
            session_id: Optional session filter

        Returns:
            Dictionary with results
        """
        start_time = datetime.now()

        intentions = await self.predict_intentions(store, session_id)

        duration = (datetime.now() - start_time).total_seconds()

        return {
            "intentions_created": len(intentions),
            "duration_seconds": duration,
            "session_id": session_id,
        }

    async def prune_expired_intentions(
        self,
        store,
    ) -> int:
        """Remove expired intention predictions.

        Args:
            store: Memory store

        Returns:
            Number of intentions pruned
        """
        intentions = await store.query_by_layer(Layer.INTENTION, limit=50)

        pruned = 0
        now = datetime.now()

        for intention in intentions:
            expires_at = intention.metadata.get("expires_at")
            if expires_at:
                try:
                    expiry = datetime.fromisoformat(expires_at)
                    if now > expiry:
                        await store.delete_record(intention.id)
                        pruned += 1
                except ValueError:
                    pass

        logger.info(f"Pruned {pruned} expired intentions")
        return pruned

    async def get_active_intentions(
        self,
        store,
        limit: int = 10,
    ) -> List[MemoryRecord]:
        """Get currently active (non-expired) intentions.

        Args:
            store: Memory store
            limit: Maximum intentions

        Returns:
            List of active intentions
        """
        all_intentions = await store.query_by_layer(Layer.INTENTION, limit=limit * 2)

        active = []
        now = datetime.now()

        for intention in all_intentions:
            expires_at = intention.metadata.get("expires_at")
            if not expires_at:
                # No expiry, consider active
                active.append(intention)
                continue

            try:
                expiry = datetime.fromisoformat(expires_at)
                if now <= expiry:
                    active.append(intention)
            except ValueError:
                pass

        return active[:limit]
