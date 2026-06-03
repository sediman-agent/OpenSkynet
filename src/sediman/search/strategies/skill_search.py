"""Skill search strategy implementation.

This strategy provides search functionality for skills using both
vector embeddings and keyword matching.
"""

from __future__ import annotations

import json
import struct
import time
from pathlib import Path
from typing import Any

from structlog import get_logger

from sediman.config import SKILLS_DIR
from ..config import (
    EXTERNAL_EMBEDDINGS_META_PATH,
    EXTERNAL_INDEX_PATH,
    KEYWORD_FALLBACK_ENABLED,
    MIN_SIMILARITY_SCORE,
    VECTOR_DB_PATH,
)
from ..base import BaseSearchStrategy, SearchResult, SearchError
from ..storage.numpy import ExternalEmbeddingStorage
from ..storage.sqlite import SQLiteVectorStorage
from ..utils.embeddings import EmbeddingProvider
from ..utils.parsers import parse_skill_result
from ..utils.scoring import cosine_similarity, keyword_score, normalize_vector

logger = get_logger()


class SkillSearchStrategy(BaseSearchStrategy):
    """Search strategy for finding skills using vector similarity and keywords.

    This strategy supports:
    - External skills with pre-computed embeddings
    - Internal skills with lazy indexing and caching
    - Keyword fallback when vector search fails
    """

    def __init__(self) -> None:
        """Initialize skill search strategy."""
        self._external_storage = ExternalEmbeddingStorage()
        self._internal_storage = SQLiteVectorStorage(VECTOR_DB_PATH)
        self._external_skills: list[dict[str, Any]] = []
        self._external_vectors: list[list[float]] = []
        self._internal_skills: list[dict[str, Any]] = []
        self._internal_vectors: list[list[float]] = []
        self._external_loaded = False
        self._internal_loaded = False
        self._internal_mtime_cache: dict[str, float] = {}
        self._embedding_provider: Any = None
        self._external_embedding_provider: Any = None
        self._external_dim: int | None = None

    @staticmethod
    def name() -> str:
        """Return strategy name."""
        return "skill"

    async def initialize(self) -> None:
        """Initialize the strategy and load data."""
        await self.ensure_loaded()

    async def ensure_loaded(self) -> None:
        """Ensure all data is loaded."""
        await self._load_external()
        self._load_internal()
        await self._ensure_internal_fresh()

    async def _load_external(self) -> None:
        """Load external skills and embeddings."""
        if self._external_loaded:
            return

        # Load external embeddings
        await self._external_storage.load()

        # Load skills from index
        index_path = EXTERNAL_INDEX_PATH
        if not index_path.exists():
            logger.debug("skill_search_no_external_index")
            self._external_loaded = True
            return

        try:
            raw = json.loads(index_path.read_text())
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("skill_search_index_read_failed", error=str(e))
            self._external_loaded = True
            return

        # Handle both list and dict formats
        if isinstance(raw, list):
            skills = raw
        elif isinstance(raw, dict):
            skills = raw.get("skills", [])
        else:
            skills = []

        # Filter skills with names
        self._external_skills = [s for s in skills if s.get("name")]

        # Load vectors
        self._external_vectors = self._external_storage.get_vectors()

        # Get dimension
        metadata = self._external_storage.get_metadata()
        self._external_dim = metadata.dimension

        self._external_loaded = True
        logger.info(
            "skill_search_external_loaded",
            skills=len(self._external_skills),
            vectors=len(self._external_vectors),
            dim=self._external_dim,
        )

    def _load_internal(self) -> None:
        """Load internal skills from SQLite storage."""
        if self._internal_loaded:
            return

        if not SKILLS_DIR.exists():
            self._internal_loaded = True
            return

        self._internal_storage.initialize()

        # Load all entries
        entries = self._internal_storage.load_all()  # type: ignore

        for entry in entries:
            self._internal_mtime_cache[entry.name] = entry.mtime
            self._internal_skills.append({
                "name": entry.name,
                "description": entry.description,
                "source": entry.source,
                "category": entry.category,
                "scope": "internal",
                "path": entry.path,
                "keywords": entry.keywords or [],
            })
            if entry.vector:
                self._internal_vectors.append(entry.vector)

        self._internal_loaded = True
        logger.info("skill_search_internal_loaded", skills=len(self._internal_skills))

    async def _ensure_internal_fresh(self) -> None:
        """Ensure internal skills are up-to-date."""
        if not SKILLS_DIR.exists():
            return

        from sediman.skills.engine import SkillEngine

        engine = SkillEngine()
        all_skills = engine.list_skills()

        changed: list[dict[str, Any]] = []
        for skill in all_skills:
            name = skill.get("name", "")
            skill_dir = engine._find_skill_in_dirs(name)
            if not skill_dir:
                continue

            try:
                mtime = skill_dir.stat().st_mtime
            except OSError:
                continue

            cached = self._internal_mtime_cache.get(name, 0)
            if mtime > cached:
                changed.append(skill)

        if not changed:
            return

        logger.info("skill_search_reindexing_internal", count=len(changed))
        await self._embed_and_store_internal(changed)

    async def _embed_and_store_internal(self, skills: list[dict[str, Any]]) -> None:
        """Generate embeddings and store for internal skills."""
        provider = self._get_embedding_provider()

        texts = []
        for skill in skills:
            parts = [skill.get("name", ""), skill.get("description", "")]
            when = skill.get("when_to_use")
            if when:
                parts.append(when)
            texts.append(" ".join(parts))

        try:
            vecs = await provider.embed(texts)
        except Exception as e:
            logger.warning("skill_search_embed_internal_failed", error=str(e))
            return

        # Store in SQLite
        from ..storage.sqlite import VectorEntry

        entries = []
        for skill, vec in zip(skills, vecs):
            skill_dir = self._find_skill_dir(skill.get("name", ""))
            mtime = skill_dir.stat().st_mtime if skill_dir else time.time()

            entries.append(VectorEntry(
                name=skill.get("name", ""),
                description=skill.get("description", ""),
                source=skill.get("source", "local"),
                category=skill.get("category", "general"),
                path=skill.get("path", ""),
                keywords=skill.get("keywords", []),
                vector=normalize_vector(vec),
                mtime=mtime,
            ))

        await self._internal_storage.store_many(entries)

        # Update in-memory cache
        for entry in entries:
            idx = self._find_internal_index(entry.name)
            if idx is not None:
                self._internal_skills[idx] = {
                    "name": entry.name,
                    "description": entry.description,
                    "source": entry.source,
                    "scope": "internal",
                    "category": entry.category,
                    "path": entry.path,
                    "keywords": entry.keywords or [],
                }
                self._internal_vectors[idx] = entry.vector or []
                self._internal_mtime_cache[entry.name] = entry.mtime
            else:
                self._internal_skills.append({
                    "name": entry.name,
                    "description": entry.description,
                    "source": entry.source,
                    "scope": "internal",
                    "category": entry.category,
                    "path": entry.path,
                    "keywords": entry.keywords or [],
                })
                if entry.vector:
                    self._internal_vectors.append(entry.vector)
                self._internal_mtime_cache[entry.name] = entry.mtime

    def _find_skill_dir(self, name: str) -> Path | None:
        """Find skill directory by name."""
        candidate = SKILLS_DIR / name
        if candidate.exists():
            return candidate
        return None

    def _find_internal_index(self, name: str) -> int | None:
        """Find internal skill index by name."""
        for i, skill in enumerate(self._internal_skills):
            if skill.get("name") == name:
                return i
        return None

    def _get_embedding_provider(self) -> Any:
        """Get default embedding provider for internal skills."""
        if self._embedding_provider is None:
            self._embedding_provider = EmbeddingProvider()
        return self._embedding_provider

    def _get_external_embedding_provider(self) -> Any:
        """Get embedding provider matching external embeddings."""
        if self._external_embedding_provider is not None:
            return self._external_embedding_provider

        # Load metadata
        metadata = self._external_storage.get_metadata()
        model_name = metadata.model or "BAAI/bge-small-en-v1.5"
        expected_dim = metadata.dimension or 384

        # Try FastEmbed first
        try:
            provider = EmbeddingProvider(
                provider="fastembed",
                model=model_name,
                expected_dimension=expected_dim,
            )
            if provider.dimension == expected_dim:
                self._external_embedding_provider = provider
                logger.info("skill_search_external_provider", name=provider.name, dim=provider.dimension)
                return provider
        except Exception as e:
            logger.debug("skill_search_fastembed_unavailable", error=str(e))

        # Fallback to default provider
        default = self._get_embedding_provider()
        if default.dimension == expected_dim:
            self._external_embedding_provider = default
            logger.info("skill_search_external_provider_default", name=default.name)
            return default

        logger.warning(
            "skill_search_no_compatible_external_provider",
            expected_dim=expected_dim,
            default_provider=default.provider_name,
            default_dim=default.dimension,
        )
        return None

    async def search(
        self,
        query: str,
        limit: int = 10,
        offset: int = 0,
        filters: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> list[SearchResult]:
        """Execute skill search.

        Args:
            query: Search query
            limit: Maximum results
            offset: Results offset
            filters: Optional filters (scope, category, source)
            **kwargs: Additional parameters

        Returns:
            List of search results
        """
        await self.ensure_loaded()

        if not query.strip():
            return []

        scope = filters.get("scope", "all") if filters else "all"
        scored: list[tuple[float, dict[str, Any]]] = []

        # Search external skills
        if scope in ("all", "external") and self._external_skills:
            ext_provider = self._get_external_embedding_provider()
            if ext_provider and self._external_vectors:
                try:
                    ext_query_vecs = await ext_provider.embed([query])
                    ext_query_vec = normalize_vector(ext_query_vecs[0])
                    for i, skill in enumerate(self._external_skills):
                        if i < len(self._external_vectors):
                            sim = cosine_similarity(ext_query_vec, self._external_vectors[i])
                            if sim >= MIN_SIMILARITY_SCORE:
                                scored.append((sim, skill))
                        else:
                            # Fallback to keyword
                            kw_score = keyword_score(query, skill)
                            if kw_score > 0:
                                scored.append((kw_score, skill))
                except Exception as e:
                    logger.warning("skill_search_external_vector_failed", error=str(e))
                    if KEYWORD_FALLBACK_ENABLED:
                        for skill in self._external_skills:
                            kw_score = keyword_score(query, skill)
                            if kw_score > 0:
                                scored.append((kw_score, skill))
            else:
                # Keyword-only for external
                for skill in self._external_skills:
                    kw_score = keyword_score(query, skill)
                    if kw_score > 0:
                        scored.append((kw_score, skill))

        # Search internal skills
        if scope in ("all", "internal") and self._internal_skills:
            int_provider = self._get_embedding_provider()
            if self._internal_vectors:
                try:
                    int_query_vecs = await int_provider.embed([query])
                    int_query_vec = normalize_vector(int_query_vecs[0])
                    for i, skill in enumerate(self._internal_skills):
                        if i < len(self._internal_vectors):
                            sim = cosine_similarity(int_query_vec, self._internal_vectors[i])
                            if sim >= MIN_SIMILARITY_SCORE:
                                scored.append((sim, skill))
                        else:
                            kw_score = keyword_score(query, skill)
                            if kw_score > 0:
                                scored.append((kw_score, skill))
                except Exception as e:
                    logger.warning("skill_search_internal_vector_failed", error=str(e))
                    if KEYWORD_FALLBACK_ENABLED:
                        for skill in self._internal_skills:
                            kw_score = keyword_score(query, skill)
                            if kw_score > 0:
                                scored.append((kw_score, skill))
            else:
                # Keyword-only for internal
                for skill in self._internal_skills:
                    kw_score = keyword_score(query, skill)
                    if kw_score > 0:
                        scored.append((kw_score, skill))

        # Sort and filter
        scored.sort(key=lambda x: -x[0])

        # Apply offset and limit
        start = offset
        end = start + limit
        sliced = scored[start:end]

        # Convert to SearchResult
        results = []
        for score, skill in sliced:
            skill["score"] = score
            results.append(parse_skill_result(skill))

        return results

    async def can_search(self, query: str) -> bool:
        """Check if this strategy can handle the query.

        Args:
            query: Search query

        Returns:
            True if query looks like skill search
        """
        # Most queries could be skill searches
        # More sophisticated filtering could be added
        return len(query.strip()) > 0

    async def cleanup(self) -> None:
        """Cleanup resources."""
        # SQLite storage cleans up automatically
        pass

    def get_schema(self) -> dict[str, Any]:
        """Get JSON schema for parameters."""
        return {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "default": 10, "minimum": 1, "maximum": 100},
                "offset": {"type": "integer", "default": 0, "minimum": 0},
                "filters": {
                    "type": "object",
                    "properties": {
                        "scope": {
                            "type": "string",
                            "enum": ["all", "external", "internal"],
                            "default": "all",
                        },
                        "category": {"type": "string"},
                        "source": {"type": "string"},
                    },
                },
            },
        }


__all__ = ["SkillSearchStrategy"]
