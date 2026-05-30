#!/usr/bin/env python3
"""Generate pre-computed embeddings for external skills.

Reads skills/index.json, embeds each skill's name + description,
and saves the result as skills/skill_embeddings.npz.

Also enhances skills/index.json with version, stats, scope, and keywords.

Incremental: if skill_embeddings.npz already exists, only new/changed skills
are embedded. Unchanged skills reuse their existing vectors.

Usage:
    python scripts/generate_skill_embeddings.py
    python scripts/generate_skill_embeddings.py --batch-size 20
    python scripts/generate_skill_embeddings.py --provider openai
    python scripts/generate_skill_embeddings.py --dry-run
    python scripts/generate_skill_embeddings.py --force          # re-embed everything
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
INDEX_PATH = PROJECT_ROOT / "skills" / "index.json"
EMBEDDINGS_PATH = PROJECT_ROOT / "skills" / "skill_embeddings.npz"
EMBEDDINGS_META_PATH = PROJECT_ROOT / "skills" / "skill_embeddings_meta.json"

sys.path.insert(0, str(PROJECT_ROOT / "src"))


def _extract_keywords(text: str, max_keywords: int = 10) -> list[str]:
    stop = {
        "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "shall", "can", "need", "dare", "ought",
        "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
        "as", "into", "through", "during", "before", "after", "above", "below",
        "between", "out", "off", "over", "under", "again", "further", "then",
        "once", "and", "but", "or", "nor", "not", "so", "yet", "both", "either",
        "neither", "each", "every", "all", "any", "few", "more", "most", "other",
        "some", "such", "no", "only", "own", "same", "than", "too", "very",
        "just", "because", "if", "when", "where", "how", "what", "which", "who",
        "whom", "this", "that", "these", "those", "it", "its", "use", "user",
        "also", "when", "skill",
    }
    words = re.findall(r"[a-z][a-z0-9_-]{2,}", text.lower())
    freq = Counter(w for w in words if w not in stop)
    return [w for w, _ in freq.most_common(max_keywords)]


def _skill_content_hash(skill: dict) -> str:
    content = f"{skill.get('name', '')}||{skill.get('description', '')}||{' '.join(skill.get('keywords', []))}"
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def enhance_index(raw_skills: list[dict]) -> dict:
    stats: dict[str, int] = Counter()
    enhanced_skills: list[dict] = []

    for skill in raw_skills:
        source = skill.get("source", "unknown")
        stats[source] += 1

        desc = skill.get("description", "")
        name = skill.get("name", "")
        kw = skill.get("keywords")
        if not kw:
            kw = _extract_keywords(f"{name} {desc}")

        enhanced_skills.append({
            "name": name,
            "description": desc,
            "source": source,
            "category": skill.get("category", "general"),
            "scope": "external",
            "path": skill.get("path", ""),
            "keywords": kw,
        })

    return {
        "version": 2,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "stats": {
            "total": len(enhanced_skills),
            "sources": dict(stats),
        },
        "skills": enhanced_skills,
    }


def _load_existing_meta() -> dict[str, str]:
    if not EMBEDDINGS_META_PATH.exists():
        return {}
    try:
        return json.loads(EMBEDDINGS_META_PATH.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def _save_meta(meta: dict[str, str]) -> None:
    EMBEDDINGS_META_PATH.write_text(json.dumps(meta, indent=2))


def _load_existing_embeddings() -> tuple[dict[str, int], list[list[float]] | None]:
    if not EMBEDDINGS_PATH.exists():
        return {}, None
    try:
        import numpy as np
        data = np.load(str(EMBEDDINGS_PATH), allow_pickle=False)
        matrix = data["embeddings"]
        return {}, matrix.tolist()
    except Exception:
        return {}, None


async def generate_embeddings(
    skills: list[dict],
    provider_name: str = "auto",
    batch_size: int = 20,
    dry_run: bool = False,
    force: bool = False,
) -> None:
    import numpy as np

    if dry_run:
        print(f"DRY RUN: Would check {len(skills)} skills for embedding")
        for s in skills:
            print(f"  - {s['name']}: {s['description'][:80]}...")
        return

    from sediman.memory.embeddings import (
        create_embedding_provider,
        OpenAIEmbeddingProvider,
        FastEmbedProvider,
    )

    if provider_name == "openai":
        provider = OpenAIEmbeddingProvider()
    elif provider_name == "fastembed":
        provider = FastEmbedProvider()
    else:
        provider = create_embedding_provider()

    print(f"Using embedding provider: {provider.name} (dim={provider.dimension})")

    existing_meta = {} if force else _load_existing_meta()
    existing_name_to_idx: dict[str, int] = {}
    existing_hashes: dict[str, str] = {}
    existing_matrix: list[list[float]] | None = None

    if not force and EMBEDDINGS_META_PATH.exists() and EMBEDDINGS_PATH.exists():
        try:
            raw_meta = json.loads(EMBEDDINGS_META_PATH.read_text())
            existing_name_to_idx = raw_meta.get("name_to_idx", {})
            existing_hashes = raw_meta.get("hashes", {})
        except Exception as e:
            print(f"Could not load existing meta: {e}")
        try:
            data = np.load(str(EMBEDDINGS_PATH), allow_pickle=False)
            if "embeddings" in data:
                existing_matrix = data["embeddings"].tolist()
        except Exception as e:
            print(f"Could not load existing embeddings: {e}")

    current_hashes = {}
    for skill in skills:
        name = skill.get("name", "")
        current_hashes[name] = _skill_content_hash(skill)

    to_embed: list[tuple[int, dict]] = []
    reused = 0
    for i, skill in enumerate(skills):
        name = skill.get("name", "")
        h = current_hashes.get(name, "")
        old_h = existing_hashes.get(name, "")
        if not force and old_h == h and name in existing_name_to_idx:
            reused += 1
        else:
            to_embed.append((i, skill))

    print(f"Skills total: {len(skills)}, reused from cache: {reused}, to embed: {len(to_embed)}")

    new_vecs: dict[int, list[float]] = {}
    if to_embed:
        texts = []
        for _, skill in to_embed:
            parts = [skill["name"], skill["description"]]
            kw = skill.get("keywords", [])
            if kw:
                parts.append(" ".join(kw[:5]))
            texts.append(" ".join(parts))

        total = len(texts)
        all_vecs: list[list[float]] = []
        for i in range(0, total, batch_size):
            batch = texts[i:i + batch_size]
            print(f"Embedding batch {i // batch_size + 1}/{(total + batch_size - 1) // batch_size} ({len(batch)} texts)...")
            vecs = await provider.embed(batch)
            all_vecs.extend(vecs)

        for j, (idx, _) in enumerate(to_embed):
            vec = all_vecs[j]
            norm = sum(v * v for v in vec) ** 0.5
            if norm > 0:
                vec = [v / norm for v in vec]
            new_vecs[idx] = vec

    final_matrix = []
    name_to_idx: dict[str, int] = {}

    for i, skill in enumerate(skills):
        name = skill.get("name", "")
        if i in new_vecs:
            final_matrix.append(new_vecs[i])
        elif existing_matrix is not None and name in existing_name_to_idx:
            old_idx = existing_name_to_idx[name]
            if old_idx < len(existing_matrix):
                final_matrix.append(existing_matrix[old_idx])
            else:
                print(f"  WARNING: {name} missing from cache, re-embedding...")
                parts = [skill["name"], skill["description"]]
                kw = skill.get("keywords", [])
                if kw:
                    parts.append(" ".join(kw[:5]))
                vecs = await provider.embed([" ".join(parts)])
                vec = vecs[0]
                norm = sum(v * v for v in vec) ** 0.5
                if norm > 0:
                    vec = [v / norm for v in vec]
                final_matrix.append(vec)
        else:
            print(f"  WARNING: {name} has no vector, embedding...")
            parts = [skill["name"], skill["description"]]
            kw = skill.get("keywords", [])
            if kw:
                parts.append(" ".join(kw[:5]))
            vecs = await provider.embed([" ".join(parts)])
            vec = vecs[0]
            norm = sum(v * v for v in vec) ** 0.5
            if norm > 0:
                vec = [v / norm for v in vec]
            final_matrix.append(vec)

        name_to_idx[name] = i

    matrix = np.array(final_matrix, dtype=np.float32)
    np.savez_compressed(str(EMBEDDINGS_PATH), embeddings=matrix)

    meta = {name: current_hashes.get(name, "") for name in name_to_idx}
    full_meta = {"name_to_idx": name_to_idx, "hashes": meta}
    EMBEDDINGS_META_PATH.write_text(json.dumps(full_meta, indent=2))

    print(f"Saved {matrix.shape[0]} embeddings (dim={matrix.shape[1]}) to {EMBEDDINGS_PATH}")
    print(f"File size: {EMBEDDINGS_PATH.stat().st_size / 1024:.1f} KB")
    print(f"Meta saved to {EMBEDDINGS_META_PATH}")


async def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Generate skill embeddings")
    parser.add_argument("--batch-size", type=int, default=20, help="Embedding batch size")
    parser.add_argument("--provider", choices=["auto", "openai", "fastembed"], default="auto")
    parser.add_argument("--dry-run", action="store_true", help="Skip embedding, just show what would be done")
    parser.add_argument("--index-only", action="store_true", help="Only enhance index.json, skip embeddings")
    parser.add_argument("--force", action="store_true", help="Re-embed all skills, ignoring cache")
    args = parser.parse_args()

    if not INDEX_PATH.exists():
        print(f"Error: {INDEX_PATH} not found. Run the indexer first.")
        sys.exit(1)

    raw = json.loads(INDEX_PATH.read_text())
    if isinstance(raw, list):
        raw_skills = raw
    elif isinstance(raw, dict):
        raw_skills = raw.get("skills", [])
    else:
        print("Error: Unexpected index.json format")
        sys.exit(1)

    print(f"Read {len(raw_skills)} skills from {INDEX_PATH}")

    enhanced = enhance_index(raw_skills)

    INDEX_PATH.write_text(json.dumps(enhanced, indent=2, ensure_ascii=False))
    print(f"Enhanced index written to {INDEX_PATH}")
    print(f"  Total: {enhanced['stats']['total']}")
    print(f"  Sources: {enhanced['stats']['sources']}")

    if not args.index_only:
        await generate_embeddings(
            enhanced["skills"],
            provider_name=args.provider,
            batch_size=args.batch_size,
            dry_run=args.dry_run,
            force=args.force,
        )


if __name__ == "__main__":
    asyncio.run(main())
