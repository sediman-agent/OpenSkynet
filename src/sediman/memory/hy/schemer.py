"""
Schema Abstractor for System 2 Memory.

Creates L5 SCHEMA layer records by analyzing behavior patterns.
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

from .models import MemoryRecord, Layer, MemType

logger = logging.getLogger(__name__)


class SchemaAbstractor:
    """Abstracts cognitive models from behavior patterns (L5 SCHEMA).

    Analyzes accumulated facts and behaviors to extract higher-level
    cognitive patterns and models.
    """

    SCHEMA_PROMPT = """Analyze these accumulated memories and extract cognitive patterns:

Facts and preferences:
{memories}

Recent behaviors:
{behaviors}

Extract cognitive patterns and behavioral schemas. These are stable patterns
in how the user thinks, decides, or behaves.

Respond with JSON:
{{
    "schemas": [
        {{
            "description": "pattern description",
            "evidence": ["fact 1", "fact 2"],
            "confidence": 0.9,
            "domain": "decision-making|social|learning|creativity|etc"
        }}
    ]
}}

Examples of schemas:
- "Prefers experiential learning over theoretical study"
- "Takes calculated risks after gathering information"
- "Values authenticity over social conformity"
- "Balances short-term rewards with long-term goals"
"""

    def __init__(self, llm_provider: Optional[Any] = None):
        """Initialize the schema abstractor.

        Args:
            llm_provider: LLM provider for abstraction
        """
        self.llm_provider = llm_provider

    async def abstract_schemas(
        self,
        store,
        session_id: Optional[str] = None,
        limit: int = 5,
    ) -> List[MemoryRecord]:
        """Abstract schemas from accumulated memories.

        Args:
            store: Memory store
            session_id: Optional session filter
            limit: Maximum schemas to create

        Returns:
            List of schema records
        """
        # Gather source data
        memories = await self._gather_source_data(store, session_id)

        if not memories:
            logger.info("Insufficient data for schema abstraction")
            return []

        # Abstract schemas
        if not self.llm_provider:
            return await self._heuristic_abstract(memories, store)

        return await self._llm_abstract(memories, store, limit)

    async def _gather_source_data(
        self,
        store,
        session_id: Optional[str] = None,
    ) -> Dict[str, List[str]]:
        """Gather source data for abstraction.

        Args:
            store: Memory store
            session_id: Optional session filter

        Returns:
            Dictionary with categorized data
        """
        # Get recent facts and preferences
        facts = await store.query_by_type(MemType.FACT, limit=50)
        preferences = await store.query_by_type(MemType.PREFERENCE, limit=30)

        # Get identity records
        identities = await store.query_by_type(MemType.IDENTITY, limit=20)

        return {
            "facts": [f.content for f in facts],
            "preferences": [p.content for p in preferences],
            "identities": [i.content for i in identities],
        }

    async def _llm_abstract(
        self,
        source_data: Dict[str, List[str]],
        store,
        limit: int,
    ) -> List[MemoryRecord]:
        """Use LLM to abstract schemas.

        Args:
            source_data: Source memories
            store: Memory store
            limit: Maximum schemas

        Returns:
            List of schema records
        """
        try:
            # Format memories
            memories_text = "\n".join(
                source_data.get("facts", [])[:20]
                + source_data.get("preferences", [])[:15]
            )
            behaviors_text = "\n".join(source_data.get("identities", [])[:10])

            prompt = self.SCHEMA_PROMPT.format(
                memories=memories_text[:1500],
                behaviors=behaviors_text[:800],
            )

            response = await self.llm_provider(
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.4,
                max_tokens=800,
            )

            import json

            data = json.loads(response.content.strip())
            schemas_data = data.get("schemas", [])

            # Create schema records
            schemas = []
            for schema_data in schemas_data[:limit]:
                schema = MemoryRecord.create(
                    layer=Layer.SCHEMA,
                    mem_type=MemType.SCHEMA,
                    content=schema_data.get("description", ""),
                    confidence=schema_data.get("confidence", 0.7),
                    metadata={
                        "evidence": schema_data.get("evidence", []),
                        "domain": schema_data.get("domain", "general"),
                        "created_at": datetime.now().isoformat(),
                    },
                )
                await store.add_record(schema)
                schemas.append(schema)

            logger.info(f"Created {len(schemas)} schemas via LLM")
            return schemas

        except Exception as e:
            logger.error(f"LLM schema abstraction failed: {e}")
            return []

    async def _heuristic_abstract(
        self,
        source_data: Dict[str, List[str]],
        store,
    ) -> List[MemoryRecord]:
        """Fallback heuristic schema abstraction.

        Args:
            source_data: Source memories
            store: Memory store

        Returns:
            List of schema records
        """
        schemas = []

        # Simple pattern detection
        all_content = (
            source_data.get("facts", [])
            + source_data.get("preferences", [])
            + source_data.get("identities", [])
        )

        # Detect patterns
        if self._contains_pattern(all_content, ["学习", "尝试", "探索", "learn", "try", "explore"]):
            schema = MemoryRecord.create(
                layer=Layer.SCHEMA,
                mem_type=MemType.SCHEMA,
                content="Experiential learner who prefers hands-on exploration",
                confidence=0.6,
                metadata={"domain": "learning", "method": "heuristic"},
            )
            await store.add_record(schema)
            schemas.append(schema)

        if self._contains_pattern(all_content, ["健康", "运动", "fitness", "exercise"]):
            schema = MemoryRecord.create(
                layer=Layer.SCHEMA,
                mem_type=MemType.SCHEMA,
                content="Health-conscious individual who values physical wellness",
                confidence=0.6,
                metadata={"domain": "lifestyle", "method": "heuristic"},
            )
            await store.add_record(schema)
            schemas.append(schema)

        logger.info(f"Created {len(schemas)} schemas via heuristic")
        return schemas

    def _contains_pattern(self, items: List[str], keywords: List[str]) -> bool:
        """Check if any item contains pattern keywords.

        Args:
            items: List of content strings
            keywords: Keywords to look for

        Returns:
            True if pattern found
        """
        for item in items:
            for keyword in keywords:
                if keyword in item.lower():
                    return True
        return False

    async def run_batch(
        self,
        store,
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Run schema abstraction batch job.

        Args:
            store: Memory store
            session_id: Optional session filter

        Returns:
            Dictionary with results
        """
        start_time = datetime.now()

        schemas = await self.abstract_schemas(store, session_id)

        duration = (datetime.now() - start_time).total_seconds()

        return {
            "schemas_created": len(schemas),
            "duration_seconds": duration,
            "session_id": session_id,
        }

    async def update_schemas(
        self,
        store,
    ) -> int:
        """Update existing schemas with new data.

        Args:
            store: Memory store

        Returns:
            Number of schemas updated
        """
        existing_schemas = await store.query_by_layer(Layer.SCHEMA, limit=20)

        updated = 0
        for schema in existing_schemas:
            # Check if schema is stale (>7 days old)
            age = datetime.now() - schema.updated_at
            if age.days > 7:
                # Refresh with new data
                new_schemas = await self.abstract_schemas(store)

                # Find matching schema and update
                for new_schema in new_schemas:
                    if self._schemas_match(schema, new_schema):
                        schema.content = new_schema.content
                        schema.metadata = {
                            **(schema.metadata or {}),
                            **(new_schema.metadata or {}),
                            "last_updated": datetime.now().isoformat(),
                        }
                        schema.updated_at = datetime.now()
                        await store.update_record(schema)
                        updated += 1
                        break

        logger.info(f"Updated {updated} schemas")
        return updated

    def _schemas_match(self, schema1: MemoryRecord, schema2: MemoryRecord) -> bool:
        """Check if two schemas represent the same pattern.

        Args:
            schema1: First schema
            schema2: Second schema

        Returns:
            True if schemas match
        """
        domain1 = schema1.metadata.get("domain", "general")
        domain2 = schema2.metadata.get("domain", "general")

        if domain1 != domain2:
            return False

        # Check content similarity
        from difflib import SequenceMatcher

        similarity = SequenceMatcher(
            None, schema1.content, schema2.content
        ).ratio()

        return similarity >= 0.6
