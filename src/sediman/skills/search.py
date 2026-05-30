"""Skill search engine with pre-computed external embeddings and lazy internal indexing.

External skills (from repo skills/) have pre-computed embeddings stored in
skill_embeddings.npz, committed alongside skills/index.json. Loading is instant
via numpy memory-mapping.

Internal skills (from ~/.sediman/skills/) are lazily indexed on first search.
Their embeddings are cached in a local SQLite database and only re-computed
when the skill file's mtime changes.
"""
from __future__ import annotations

import json
import math
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog

from sediman.config import SKILLS_DIR

logger = structlog.get_logger()


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent.parent


def _external_index_path() -> Path:
    return _project_root() / "skills" / "index.json"


def _external_embeddings_path() -> Path:
    return _project_root() / "skills" / "skill_embeddings.npz"


def _internal_vector_db_path() -> Path:
    return SKILLS_DIR / "skill_vectors.db"


@dataclass
class SkillSearchResult:
    name: str
    description: str
    score: float
    scope: str
    source: str
    path: str
    category: str = "general"
    keywords: list[str] | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "name": self.name,
            "description": self.description,
            "score": round(self.score, 4),
            "scope": self.scope,
            "source": self.source,
            "path": self.path,
            "category": self.category,
        }
        if self.keywords:
            d["keywords"] = self.keywords
        return d


def _normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vec))
    if norm == 0:
        return vec
    return [v / norm for v in vec]


def _cosine_similarity(query_vec: list[float], doc_vec: list[float]) -> float:
    dot = sum(a * b for a, b in zip(query_vec, doc_vec))
    norm_a = math.sqrt(sum(a * a for a in query_vec))
    norm_b = math.sqrt(sum(b * b for b in doc_vec))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


class SkillSearchEngine:
    def __init__(self) -> None:
        self._external_skills: list[dict[str, Any]] = []
        self._external_vectors: list[list[float]] = []
        self._external_loaded = False
        self._internal_skills: list[dict[str, Any]] = []
        self._internal_vectors: list[list[float]] = []
        self._internal_loaded = False
        self._internal_mtime_cache: dict[str, float] = {}
        self._embedding_provider: Any = None

    def _get_embedding_provider(self) -> Any:
        if self._embedding_provider is None:
            from sediman.memory.embeddings import create_embedding_provider
            self._embedding_provider = create_embedding_provider()
        return self._embedding_provider

    def _load_external(self) -> None:
        if self._external_loaded:
            return

        index_path = _external_index_path()
        embeddings_path = _external_embeddings_path()

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

        if isinstance(raw, list):
            skills = raw
        elif isinstance(raw, dict):
            skills = raw.get("skills", [])
        else:
            skills = []

        self._external_skills = [
            s for s in skills
            if s.get("name")
        ]

        if embeddings_path.exists():
            self._load_external_vectors(embeddings_path)
        else:
            logger.info("skill_search_no_embeddings_file", path=str(embeddings_path))

        self._external_loaded = True
        logger.info(
            "skill_search_external_loaded",
            skills=len(self._external_skills),
            vectors=len(self._external_vectors),
        )

    def _load_external_vectors(self, path: Path) -> None:
        try:
            import numpy as np
            data = np.load(str(path), allow_pickle=False)
            if "embeddings" in data:
                matrix = data["embeddings"]
                self._external_vectors = [row.tolist() for row in matrix]
            else:
                arr = data.get("arr_0")
                if arr is not None:
                    self._external_vectors = [row.tolist() for row in arr]
        except Exception as e:
            logger.warning("skill_search_npz_load_failed", error=str(e))
            self._external_vectors = []

    def _load_internal(self) -> None:
        if self._internal_loaded:
            return

        if not SKILLS_DIR.exists():
            self._internal_loaded = True
            return

        db_path = _internal_vector_db_path()
        self._ensure_internal_db(db_path)

        self._load_internal_from_db(db_path)
        self._internal_loaded = True

    def _ensure_internal_db(self, db_path: Path) -> None:
        if db_path.exists():
            return
        db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(db_path))
        try:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS skill_vectors (
                    name TEXT PRIMARY KEY,
                    description TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'local',
                    category TEXT NOT NULL DEFAULT 'general',
                    path TEXT NOT NULL DEFAULT '',
                    keywords TEXT NOT NULL DEFAULT '[]',
                    vector BLOB NOT NULL,
                    mtime REAL NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL DEFAULT 0
                );
            """)
            conn.commit()
        finally:
            conn.close()

    def _load_internal_from_db(self, db_path: Path) -> None:
        try:
            conn = sqlite3.connect(str(db_path))
            try:
                rows = conn.execute(
                    "SELECT name, description, source, category, path, keywords, vector, mtime "
                    "FROM skill_vectors"
                ).fetchall()
            finally:
                conn.close()
        except Exception as e:
            logger.warning("skill_search_internal_db_read_failed", error=str(e))
            return

        import struct

        for row in rows:
            name, desc, source, category, path, kw_json, blob, mtime = row
            self._internal_mtime_cache[name] = mtime
            self._internal_skills.append({
                "name": name,
                "description": desc,
                "source": source,
                "category": category,
                "scope": "internal",
                "path": path,
                "keywords": json.loads(kw_json) if kw_json else [],
            })
            n = len(blob) // 4
            vec = list(struct.unpack(f"{n}f", blob))
            self._internal_vectors.append(vec)

        logger.info(
            "skill_search_internal_loaded",
            skills=len(self._internal_skills),
        )

    async def _ensure_internal_fresh(self) -> None:
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
        import struct as _struct

        provider = self._get_embedding_provider()
        texts = []
        for s in skills:
            parts = [s.get("name", ""), s.get("description", "")]
            when = s.get("when_to_use")
            if when:
                parts.append(when)
            texts.append(" ".join(parts))

        try:
            vecs = await provider.embed(texts)
        except Exception as e:
            logger.warning("skill_search_embed_internal_failed", error=str(e))
            return

        db_path = _internal_vector_db_path()
        conn = sqlite3.connect(str(db_path))
        try:
            for skill, vec in zip(skills, vecs):
                name = skill.get("name", "")
                desc = skill.get("description", "")
                source = skill.get("source", "local")
                category = skill.get("category", "general")
                path = skill.get("path", "")
                keywords = json.dumps(skill.get("keywords", []))
                vec_norm = _normalize(vec)
                blob = _struct.pack(f"{len(vec_norm)}f", *vec_norm)
                skill_dir = self._find_skill_dir(name)
                mtime = skill_dir.stat().st_mtime if skill_dir else time.time()

                conn.execute(
                    "INSERT OR REPLACE INTO skill_vectors "
                    "(name, description, source, category, path, keywords, vector, mtime, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (name, desc, source, category, path, keywords, blob, mtime, time.time()),
                )

                idx = self._find_internal_index(name)
                if idx is not None:
                    self._internal_skills[idx] = {
                        "name": name, "description": desc,
                        "source": source, "scope": "internal",
                        "category": category, "path": path,
                        "keywords": skill.get("keywords", []),
                    }
                    self._internal_vectors[idx] = vec_norm
                    self._internal_mtime_cache[name] = mtime
                else:
                    self._internal_skills.append({
                        "name": name, "description": desc,
                        "source": source, "scope": "internal",
                        "category": category, "path": path,
                        "keywords": skill.get("keywords", []),
                    })
                    self._internal_vectors.append(vec_norm)
                    self._internal_mtime_cache[name] = mtime

            conn.commit()
        finally:
            conn.close()

    def _find_skill_dir(self, name: str) -> Path | None:
        candidate = SKILLS_DIR / name
        if candidate.exists():
            return candidate
        return None

    def _find_internal_index(self, name: str) -> int | None:
        for i, s in enumerate(self._internal_skills):
            if s.get("name") == name:
                return i
        return None

    async def ensure_loaded(self) -> None:
        self._load_external()
        self._load_internal()
        await self._ensure_internal_fresh()

    async def search(
        self,
        query: str,
        scope: str = "all",
        k: int = 5,
    ) -> list[SkillSearchResult]:
        await self.ensure_loaded()

        if not query.strip():
            return []

        provider = self._get_embedding_provider()
        try:
            query_vecs = await provider.embed([query])
            query_vec = _normalize(query_vecs[0])
        except Exception as e:
            logger.warning("skill_search_query_embed_failed", error=str(e))
            return self._keyword_fallback(query, scope, k)

        scored: list[tuple[float, dict[str, Any]]] = []

        if scope in ("all", "external"):
            for i, skill in enumerate(self._external_skills):
                if i < len(self._external_vectors):
                    sim = _cosine_similarity(query_vec, self._external_vectors[i])
                    if sim > 0.1:
                        scored.append((sim, skill))
                else:
                    kw_score = self._keyword_score(query, skill)
                    if kw_score > 0:
                        scored.append((kw_score * 0.5, skill))

        if scope in ("all", "internal"):
            for i, skill in enumerate(self._internal_skills):
                if i < len(self._internal_vectors):
                    sim = _cosine_similarity(query_vec, self._internal_vectors[i])
                    if sim > 0.1:
                        scored.append((sim, skill))

        scored.sort(key=lambda x: -x[0])

        results: list[SkillSearchResult] = []
        for score, skill in scored[:k]:
            results.append(SkillSearchResult(
                name=skill.get("name", ""),
                description=skill.get("description", ""),
                score=score,
                scope=skill.get("scope", "external"),
                source=skill.get("source", "unknown"),
                path=skill.get("path", ""),
                category=skill.get("category", "general"),
                keywords=skill.get("keywords"),
            ))

        return results

    def _keyword_fallback(
        self, query: str, scope: str, k: int,
    ) -> list[SkillSearchResult]:
        query_words = set(query.lower().split())
        scored: list[tuple[float, dict[str, Any]]] = []

        candidates: list[dict[str, Any]] = []
        if scope in ("all", "external"):
            candidates.extend(self._external_skills)
        if scope in ("all", "internal"):
            candidates.extend(self._internal_skills)

        for skill in candidates:
            score = self._keyword_score(query, skill)
            if score > 0:
                scored.append((score, skill))

        scored.sort(key=lambda x: -x[0])

        return [
            SkillSearchResult(
                name=s.get("name", ""),
                description=s.get("description", ""),
                score=score,
                scope=s.get("scope", "external"),
                source=s.get("source", "unknown"),
                path=s.get("path", ""),
                category=s.get("category", "general"),
                keywords=s.get("keywords"),
            )
            for score, s in scored[:k]
        ]

    @staticmethod
    def _keyword_score(query: str, skill: dict[str, Any]) -> float:
        query_words = set(query.lower().split())
        haystack = f"{skill.get('name', '')} {skill.get('description', '')} {skill.get('category', '')}".lower()
        hay_words = set(haystack.split())
        overlap = len(query_words & hay_words)
        if overlap == 0:
            return 0.0
        return overlap / max(len(query_words), 1)
