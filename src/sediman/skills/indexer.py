from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import structlog
import yaml

logger = structlog.get_logger()

_DEFAULT_SOURCES = [
    {
        "name": "anthropics/skills",
        "type": "github",
        "owner": "anthropics",
        "repo": "skills",
        "path": "skills",
        "branch": "main",
    },
    {
        "name": "cursor/plugins",
        "type": "github",
        "owner": "cursor",
        "repo": "plugins",
        "path": "",
        "branch": "main",
        "root_level": True,
    },
    {
        "name": "vercel-labs/skills",
        "type": "github",
        "owner": "vercel-labs",
        "repo": "skills",
        "path": "skills",
        "branch": "main",
    },
    {
        "name": "cloudflare/skills",
        "type": "github",
        "owner": "cloudflare",
        "repo": "skills",
        "path": "skills",
        "branch": "main",
    },
    {
        "name": "huggingface/skills",
        "type": "github",
        "owner": "huggingface",
        "repo": "skills",
        "path": "skills",
        "branch": "main",
    },
    {
        "name": "firecrawl/skills",
        "type": "github",
        "owner": "firecrawl",
        "repo": "skills",
        "path": "skills",
        "branch": "main",
    },
    {
        "name": "veniceai/skills",
        "type": "github",
        "owner": "veniceai",
        "repo": "skills",
        "path": "skills",
        "branch": "main",
    },
    {
        "name": "expo/skills",
        "type": "github",
        "owner": "expo",
        "repo": "skills",
        "path": "plugins/expo/skills",
        "branch": "main",
    },
    {
        "name": "browserbase/skills",
        "type": "github",
        "owner": "browserbase",
        "repo": "skills",
        "path": "skills",
        "branch": "main",
    },
    {
        "name": "coderabbitai/skills",
        "type": "github",
        "owner": "coderabbitai",
        "repo": "skills",
        "path": "skills",
        "branch": "main",
    },
    {
        "name": "mattpocock/skills",
        "type": "github",
        "owner": "mattpocock",
        "repo": "skills",
        "path": "skills",
        "branch": "main",
        "depth": 1,
    },
    {
        "name": "angular/skills",
        "type": "github",
        "owner": "angular",
        "repo": "skills",
        "path": "",
        "branch": "main",
        "root_level": True,
    },
    {
        "name": "microsoft/skills",
        "type": "github",
        "owner": "microsoft",
        "repo": "skills",
        "path": "",
        "branch": "main",
        "root_level": True,
    },
    {
        "name": "openai/skills",
        "type": "github",
        "owner": "openai",
        "repo": "skills",
        "path": "",
        "branch": "main",
        "root_level": True,
    },
    {
        "name": "nvidia/skills",
        "type": "github",
        "owner": "nvidia",
        "repo": "skills",
        "path": "",
        "branch": "main",
        "root_level": True,
    },
    {
        "name": "redis/agent-skills",
        "type": "github",
        "owner": "redis",
        "repo": "agent-skills",
        "path": "",
        "branch": "main",
        "root_level": True,
    },
    {
        "name": "resend/resend-skills",
        "type": "github",
        "owner": "resend",
        "repo": "resend-skills",
        "path": "",
        "branch": "main",
        "root_level": True,
    },
    {
        "name": "replicate/skills",
        "type": "github",
        "owner": "replicate",
        "repo": "skills",
        "path": "",
        "branch": "main",
        "root_level": True,
    },
    {
        "name": "remotion-dev/skills",
        "type": "github",
        "owner": "remotion-dev",
        "repo": "skills",
        "path": "",
        "branch": "main",
        "root_level": True,
    },
    {
        "name": "composiohq/skills",
        "type": "github",
        "owner": "composiohq",
        "repo": "skills",
        "path": "",
        "branch": "main",
        "root_level": True,
    },
    {
        "name": "fal-ai-community/skills",
        "type": "github",
        "owner": "fal-ai-community",
        "repo": "skills",
        "path": "",
        "branch": "main",
        "root_level": True,
    },
    {
        "name": "video-db/skills",
        "type": "github",
        "owner": "video-db",
        "repo": "skills",
        "path": "",
        "branch": "main",
        "root_level": True,
    },
    {
        "name": "qdrant/skills",
        "type": "github",
        "owner": "qdrant",
        "repo": "skills",
        "path": "",
        "branch": "main",
        "root_level": True,
    },
    {
        "name": "transloadit/skills",
        "type": "github",
        "owner": "transloadit",
        "repo": "skills",
        "path": "",
        "branch": "main",
        "root_level": True,
    },
    {
        "name": "metalbear-co/skills",
        "type": "github",
        "owner": "metalbear-co",
        "repo": "skills",
        "path": "",
        "branch": "main",
        "root_level": True,
    },
    {
        "name": "mcollina/skills",
        "type": "github",
        "owner": "mcollina",
        "repo": "skills",
        "path": "",
        "branch": "main",
        "root_level": True,
    },
    {
        "name": "obra/superpowers",
        "type": "github",
        "owner": "obra",
        "repo": "superpowers",
        "path": "",
        "branch": "main",
        "root_level": True,
    },
    {
        "name": "makenotion/skills",
        "type": "github",
        "owner": "makenotion",
        "repo": "skills",
        "path": "",
        "branch": "main",
        "root_level": True,
    },
    {
        "name": "trycourier/courier-skills",
        "type": "github",
        "owner": "trycourier",
        "repo": "courier-skills",
        "path": "",
        "branch": "main",
        "root_level": True,
    },
    {
        "name": "MiniMax-AI/skills",
        "type": "github",
        "owner": "MiniMax-AI",
        "repo": "skills",
        "path": "",
        "branch": "main",
        "root_level": True,
    },
    {
        "name": "kostja94/marketing-skills",
        "type": "github",
        "owner": "kostja94",
        "repo": "marketing-skills",
        "path": "skills",
        "branch": "main",
        "skill_by_marker": True,
    },
    {
        "name": "browser-use/browser-use",
        "type": "github",
        "owner": "browser-use",
        "repo": "browser-use",
        "path": "skills",
        "branch": "main",
    },
    {
        "name": "browser-use/video-use",
        "type": "github",
        "owner": "browser-use",
        "repo": "video-use",
        "path": "",
        "branch": "main",
        "skill_by_marker": True,
    },
]

_ROOT_EXCLUDE = {".cursor-plugin", ".claude-plugin", ".github", ".codex", "schemas", "scripts", "src", "tests", "bin", ".husky"}


@dataclass
class SkillIndexEntry:
    name: str
    description: str
    source: str
    category: str = "general"
    path: str = ""
    scope: str = "external"


@dataclass
class SkillSearchResult:
    name: str
    description: str
    source: str
    path: str
    score: float


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent.parent


def _skills_repo_dir() -> Path:
    return _project_root() / "skills"


def _index_path() -> Path:
    return _skills_repo_dir() / "index.json"


def _skill_source_dir(source_name: str) -> Path:
    safe_name = source_name.replace("/", "_")
    return _skills_repo_dir() / safe_name


_PERMISSIVE_LICENSES = {
    "mit", "apache-2.0", "apache-license-2.0", "isc", "bsd-2-clause",
    "bsd-3-clause", "0bsd", "unlicense", "cc0-1.0",
}

_PERMISSIVE_KEYWORDS = [
    "mit license",
    "permission is hereby granted, free of charge",
    "apache license",
    "isc license",
    "permission to use, copy, modify, and/or distribute",
    "bsd license",
]


class SkillIndexer:
    def __init__(self, sources: list[dict[str, Any]] | None = None):
        self.sources = sources or _DEFAULT_SOURCES

    async def refresh_index(self, remote: bool = False) -> dict[str, Any]:
        if not remote:
            return self._refresh_index_local()

        all_entries: list[SkillIndexEntry] = []
        errors: list[str] = []
        stats: dict[str, int] = {}

        for source_cfg in self.sources:
            source_type = source_cfg.get("type", "github")
            source_name = source_cfg.get("name", "unknown")

            try:
                if source_type == "github":
                    entries = await self._download_github_skills(source_cfg)
                else:
                    logger.warning("unknown_source_type", source=source_name, type=source_type)
                    continue

                all_entries.extend(entries)
                stats[source_name] = len(entries)
                logger.info("skill_index_source_fetched", source=source_name, count=len(entries))
            except Exception as e:
                logger.warning("skill_index_source_failed", source=source_name, error=str(e))
                errors.append(f"{source_name}: {e}")

        self._write_index(all_entries)

        return {
            "total_indexed": len(all_entries),
            "sources": stats,
            "errors": errors,
        }

    def _refresh_index_local(self) -> dict[str, Any]:
        entries = self._scan_local_skills()
        self._write_index(entries)
        stats: dict[str, int] = {}
        for e in entries:
            stats[e.source] = stats.get(e.source, 0) + 1
        logger.info("skill_index_local_refresh", total=len(entries))
        return {
            "total_indexed": len(entries),
            "sources": stats,
            "errors": [],
        }

    def _scan_local_skills(self) -> list[SkillIndexEntry]:
        entries: list[SkillIndexEntry] = []
        skills_root = _skills_repo_dir()
        if not skills_root.exists():
            logger.warning("skills_repo_dir_not_found", path=str(skills_root))
            return entries

        for source_dir in sorted(skills_root.iterdir()):
            if not source_dir.is_dir():
                continue
            if source_dir.name == "index.json":
                continue

            source_name_candidate = source_dir.name.replace("_", "/", 1)
            for skill_dir in sorted(source_dir.iterdir()):
                if not skill_dir.is_dir():
                    continue
                entry = self._make_entry_from_local(
                    skill_dir, skill_dir.name, source_name_candidate, source_dir,
                )
                entries.append(entry)

        return entries

    def search(self, query: str, k: int = 10) -> list[SkillSearchResult]:
        entries = self._read_index()
        if not entries or not query.strip():
            return []

        query_words = set(re.findall(r"[a-z0-9]+", query.lower()))

        scored: list[tuple[float, SkillIndexEntry]] = []
        for entry in entries:
            haystack = f"{entry.name} {entry.description} {entry.category}".lower()
            haystack_words = set(re.findall(r"[a-z0-9]+", haystack))
            if not haystack_words:
                continue

            overlap = len(query_words & haystack_words)
            if overlap == 0:
                continue

            name_bonus = 0.0
            qname = query.lower()
            ename = entry.name.lower()
            if ename in qname or qname in ename:
                name_bonus = 0.3
            if qname.startswith(ename) or ename.startswith(qname):
                name_bonus = 0.5

            score = overlap / max(len(query_words), 1) + name_bonus
            scored.append((score, entry))

        scored.sort(key=lambda x: -x[0])

        return [
            SkillSearchResult(
                name=entry.name,
                description=entry.description,
                source=entry.source,
                path=entry.path,
                score=min(score, 1.0),
            )
            for score, entry in scored[:k]
        ]

    def get_all(self) -> list[SkillIndexEntry]:
        return self._read_index()

    def get_local_skill_dir(self, name: str, source: str) -> Path | None:
        entries = self._read_index()
        for e in entries:
            if e.name == name and e.source == source:
                return _skills_repo_dir() / e.path
        alt = _skills_repo_dir() / source.replace("/", "_") / name
        if alt.exists():
            return alt
        return None

    def _read_index(self) -> list[SkillIndexEntry]:
        path = _index_path()
        if not path.exists():
            logger.info("skill_index_not_found", path=str(path))
            return []
        try:
            data = json.loads(path.read_text())
            return [
                SkillIndexEntry(
                    name=item.get("name", ""),
                    description=item.get("description", ""),
                    source=item.get("source", "unknown"),
                    category=item.get("category", "general"),
                    path=item.get("path", ""),
                    scope=item.get("scope", "external"),
                )
                for item in data
                if item.get("name")
            ]
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("skill_index_read_failed", error=str(e))
            return []

    def _write_index(self, entries: list[SkillIndexEntry]) -> None:
        path = _index_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        data = [
            {
                "name": e.name,
                "description": e.description,
                "source": e.source,
                "category": e.category,
                "path": e.path,
                "scope": e.scope,
            }
            for e in entries
        ]
        path.write_text(json.dumps(data, indent=2))
        logger.info("skill_index_written", path=str(path), count=len(data))

    async def _download_github_skills(self, cfg: dict[str, Any]) -> list[SkillIndexEntry]:
        owner = cfg["owner"]
        repo = cfg["repo"]
        prefix = cfg.get("path", "")
        branch = cfg.get("branch", "main")
        source_name = cfg.get("name", f"github:{owner}/{repo}")

        license_ok = await self._check_repo_license(owner, repo, branch)
        if not license_ok:
            logger.warning("skill_source_license_rejected", source=source_name)
            return []

        tree = await self._fetch_github_tree(owner, repo, branch)
        if not tree:
            return []

        root_level = cfg.get("root_level", False)
        depth = cfg.get("depth", 0)
        skill_by_marker = cfg.get("skill_by_marker", False)
        skill_dirs = self._group_files_by_skill(tree, prefix, owner, repo, branch, root_level=root_level, depth=depth, skill_by_marker=skill_by_marker)
        if not skill_dirs:
            return []

        dest_base = _skill_source_dir(source_name)
        entries: list[SkillIndexEntry] = []

        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            import asyncio

            for skill_name, files in skill_dirs.items():
                skill_dest = dest_base / skill_name
                skill_dest.mkdir(parents=True, exist_ok=True)

                file_tasks = []
                for file_rel_path, raw_url in files:
                    local_file = skill_dest / file_rel_path
                    file_tasks.append(self._download_file(client, raw_url, local_file))

                await asyncio.gather(*file_tasks, return_exceptions=True)

                entry = self._make_entry_from_local(skill_dest, skill_name, source_name, dest_base)
                entries.append(entry)

        return entries

    def _make_entry_from_local(self, skill_dest: Path, skill_name: str, source_name: str, dest_base: Path) -> SkillIndexEntry:
        skill_md = skill_dest / "SKILL.md"
        if skill_md.exists():
            parsed = self._parse_skill_frontmatter(skill_md.read_text())
            if parsed:
                return SkillIndexEntry(
                    name=parsed.get("name", skill_name),
                    description=parsed.get("description", ""),
                    source=source_name,
                    category=parsed.get("category", "general"),
                    path=f"{dest_base.name}/{skill_name}",
                )

        for nested in skill_dest.rglob("SKILL.md"):
            parsed = self._parse_skill_frontmatter(nested.read_text())
            if parsed:
                return SkillIndexEntry(
                    name=parsed.get("name", skill_name),
                    description=parsed.get("description", ""),
                    source=source_name,
                    category=parsed.get("category", "general"),
                    path=f"{dest_base.name}/{skill_name}",
                )

        plugin_json = skill_dest / ".cursor-plugin" / "plugin.json"
        if plugin_json.exists():
            try:
                data = json.loads(plugin_json.read_text())
                return SkillIndexEntry(
                    name=data.get("name", skill_name),
                    description=data.get("description", ""),
                    source=source_name,
                    category=data.get("category", "general"),
                    path=f"{dest_base.name}/{skill_name}",
                )
            except json.JSONDecodeError:
                pass

        json_file = skill_dest / "skill.json"
        if json_file.exists():
            try:
                data = json.loads(json_file.read_text())
                return SkillIndexEntry(
                    name=data.get("name", skill_name),
                    description=data.get("description", ""),
                    source=source_name,
                    category=data.get("category", "general"),
                    path=f"{dest_base.name}/{skill_name}",
                )
            except json.JSONDecodeError:
                pass

        return SkillIndexEntry(
            name=skill_name,
            description=f"Skill from {source_name}",
            source=source_name,
            path=f"{dest_base.name}/{skill_name}",
        )

    async def _check_repo_license(self, owner: str, repo: str, branch: str) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
                resp = await client.get(
                    f"https://api.github.com/repos/{owner}/{repo}",
                    headers={"Accept": "application/vnd.github+json"},
                )
                if resp.status_code == 200:
                    lic = resp.json().get("license")
                    if lic:
                        spdx = (lic.get("spdx_id") or "").lower()
                        if spdx in _PERMISSIVE_LICENSES:
                            return True

                for lic_name in ["LICENSE", "LICENSE.md", "LICENSE.txt", "license"]:
                    resp = await client.get(
                        f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{lic_name}"
                    )
                    if resp.status_code == 200:
                        text = resp.text[:1000].lower()
                        for kw in _PERMISSIVE_KEYWORDS:
                            if kw in text:
                                return True
                        return False

                logger.info("skill_source_no_license", repo=f"{owner}/{repo}")
                return False
        except Exception as e:
            logger.warning("skill_source_license_check_error", error=str(e))
            return False

    async def _fetch_github_tree(self, owner: str, repo: str, branch: str) -> list[dict[str, Any]]:
        tree_url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(tree_url, headers={"Accept": "application/vnd.github+json"})
                if resp.status_code == 200:
                    return resp.json().get("tree", [])
                logger.warning("github_tree_api_failed", url=tree_url, status=resp.status_code)
                return []
        except Exception as e:
            logger.warning("github_tree_fetch_error", error=str(e))
            return []

    def _group_files_by_skill(self, tree: list[dict[str, Any]], prefix: str, owner: str, repo: str, branch: str, root_level: bool = False, depth: int = 0, skill_by_marker: bool = False) -> dict[str, list[tuple[str, str]]]:
        if skill_by_marker:
            return self._group_by_marker(tree, prefix, owner, repo, branch)

        skill_dirs: dict[str, list[tuple[str, str]]] = {}

        for item in tree:
            item_path: str = item.get("path", "")
            item_type: str = item.get("type", "")
            if item_type != "blob":
                continue

            if prefix:
                prefix_slash = f"{prefix}/"
                if not item_path.startswith(prefix_slash):
                    continue
                rest = item_path[len(prefix_slash):]
            else:
                rest = item_path

            parts = rest.split("/")
            min_parts = 2 + depth
            if len(parts) < min_parts:
                continue

            skill_name = parts[depth]

            if root_level:
                if skill_name.startswith("."):
                    continue
                if skill_name in _ROOT_EXCLUDE:
                    continue
                if skill_name in ("README.md", ".gitignore", "LICENSE"):
                    continue

            file_rel = "/".join(parts[depth + 1:])

            raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{item_path}"

            if skill_name not in skill_dirs:
                skill_dirs[skill_name] = []
            skill_dirs[skill_name].append((file_rel, raw_url))

        if root_level:
            skill_dirs = {
                name: files
                for name, files in skill_dirs.items()
                if any(f[0] == ".cursor-plugin/plugin.json" for f in files)
            }

        return skill_dirs

    def _group_by_marker(self, tree: list[dict[str, Any]], prefix: str, owner: str, repo: str, branch: str) -> dict[str, list[tuple[str, str]]]:
        skill_parent_dirs: set[str] = set()

        for item in tree:
            item_path: str = item.get("path", "")
            if not item_path.endswith("SKILL.md"):
                continue

            if prefix:
                prefix_slash = f"{prefix}/"
                if not item_path.startswith(prefix_slash):
                    continue
                rest = item_path[len(prefix_slash):]
            else:
                rest = item_path

            parts = rest.split("/")
            if len(parts) < 2:
                continue

            parent = "/".join(parts[:-1])
            skill_parent_dirs.add(parent)

        if not skill_parent_dirs:
            return {}

        skill_dirs: dict[str, list[tuple[str, str]]] = {}
        for item in tree:
            item_path: str = item.get("path", "")
            item_type: str = item.get("type", "")
            if item_type != "blob":
                continue

            if prefix:
                prefix_slash = f"{prefix}/"
                if not item_path.startswith(prefix_slash):
                    continue
                rest = item_path[len(prefix_slash):]
            else:
                rest = item_path

            for parent in skill_parent_dirs:
                if rest == f"{parent}/{rest.split('/')[-1]}" or rest.startswith(f"{parent}/"):
                    rel = rest[len(parent) + 1:]
                    if not rel:
                        continue
                    skill_name = parent.split("/")[-1]
                    raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{item_path}"

                    if skill_name not in skill_dirs:
                        skill_dirs[skill_name] = []
                    skill_dirs[skill_name].append((rel, raw_url))
                    break

        return skill_dirs

    async def _download_file(self, client: httpx.AsyncClient, url: str, dest: Path) -> None:
        try:
            resp = await client.get(url)
            if resp.status_code == 200:
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(resp.content)
            else:
                logger.warning("download_failed", url=url, status=resp.status_code)
        except Exception as e:
            logger.warning("download_error", url=url, error=str(e))

    @staticmethod
    def _parse_skill_frontmatter(content: str) -> dict[str, Any] | None:
        if not content.startswith("---"):
            return None

        parts = content.split("---", 2)
        if len(parts) < 3:
            return None

        try:
            frontmatter = yaml.safe_load(parts[1])
            if isinstance(frontmatter, dict):
                return frontmatter
        except yaml.YAMLError:
            pass

        result: dict[str, Any] = {}
        for line in parts[1].strip().split("\n"):
            if ":" in line:
                key, _, val = line.partition(":")
                result[key.strip()] = val.strip().strip('"').strip("'")
        return result if result else None
