from __future__ import annotations

import difflib
import time
from pathlib import Path
from typing import Any

import structlog

from sediman.agent.tool_dispatch import ToolResult

logger = structlog.get_logger()

_FILE_CACHE: dict[str, tuple[float, str]] = {}
_CACHE_TTL = 5.0


def _get_cached_content(path: Path) -> str | None:
    try:
        stat = path.stat()
        mtime = stat.st_mtime
        cached = _FILE_CACHE.get(str(path))
        if cached and cached[0] == mtime:
            return cached[1]
    except OSError:
        pass
    return None


def _set_cached_content(path: Path, content: str) -> None:
    try:
        mtime = path.stat().st_mtime
        _FILE_CACHE[str(path)] = (mtime, content)
    except OSError:
        pass


def _invalidate_cache(path: Path) -> None:
    _FILE_CACHE.pop(str(path), None)


def _detect_language(path: Path) -> str:
    ext_map = {
        ".py": "Python", ".js": "JavaScript", ".ts": "TypeScript",
        ".tsx": "TypeScript", ".jsx": "JavaScript", ".rs": "Rust",
        ".go": "Go", ".rb": "Ruby", ".java": "Java", ".kt": "Kotlin",
        ".swift": "Swift", ".c": "C", ".cpp": "C++", ".h": "C/C++ Header",
        ".hpp": "C++ Header", ".cs": "C#", ".scala": "Scala", ".r": "R",
        ".R": "R", ".m": "Objective-C", ".sh": "Shell", ".bash": "Bash",
        ".zsh": "Zsh", ".fish": "Fish", ".ps1": "PowerShell",
        ".sql": "SQL", ".html": "HTML", ".css": "CSS", ".scss": "SCSS",
        ".less": "Less", ".yaml": "YAML", ".yml": "YAML", ".toml": "TOML",
        ".json": "JSON", ".xml": "XML", ".md": "Markdown",
        ".dockerfile": "Dockerfile", ".tf": "Terraform",
        ".lua": "Lua", ".vim": "Vim", ".el": "Emacs Lisp",
        ".ex": "Elixir", ".exs": "Elixir", ".erl": "Erlang",
        ".hs": "Haskell", ".ml": "OCaml", ".fs": "F#",
        ".dart": "Dart", ".zig": "Zig", ".nim": "Nim",
        ".v": "V", ".wasm": "WebAssembly",
    }
    if path.name == "Dockerfile":
        return "Dockerfile"
    if path.name == "Makefile" or path.name == "makefile":
        return "Makefile"
    return ext_map.get(path.suffix.lower(), "")


async def _handle_read_file(
    path: str | None = None,
    offset: int | None = None,
    limit: int | None = None,
    **kwargs: Any,
) -> ToolResult:
    if not path:
        return ToolResult(success=False, output="path is required.")
    try:
        p = Path(path).expanduser().resolve()
        if not p.exists():
            return ToolResult(success=False, output=f"File not found: {p}")
        if not p.is_file():
            return ToolResult(success=False, output=f"Not a file: {p}")
        file_size = p.stat().st_size
        if file_size > 1_000_000:
            return ToolResult(
                success=False,
                output=f"File too large ({file_size:,} bytes, {file_size // 1024}KB). Use offset/limit for pagination or terminal with head/tail.",
            )

        content = _get_cached_content(p)
        if content is None:
            content = p.read_text(errors="replace")
            _set_cached_content(p, content)

        lines = content.splitlines()
        total_lines = len(lines)
        start = max(1, (offset or 1))
        end = start + (limit or total_lines)
        start = min(start, total_lines + 1)
        sliced = lines[start - 1 : end - 1]
        numbered = [
            f"{i}: {line}" for i, line in zip(range(start, start + len(sliced)), sliced)
        ]
        output = "\n".join(numbered)
        if len(output) > 100000:
            output = output[:100000] + "\n... (truncated)"

        lang = _detect_language(p)
        header_parts = [f"File: {p} ({total_lines} lines, {file_size:,} bytes"]
        if lang:
            header_parts[0] += f", {lang}"
        header_parts[0] += ")"
        if offset or limit:
            header_parts.append(f"[showing lines {start}-{start + len(sliced) - 1}]")
        header = "\n".join(header_parts)

        return ToolResult(
            success=True,
            output=f"{header}\n{output}",
            data={"path": str(p), "size": file_size, "total_lines": total_lines, "language": lang},
        )
    except (OSError, UnicodeDecodeError) as e:
        logger.error("tool_read_file_error", error=str(e))
        return ToolResult(success=False, output=f"Failed to read file: {e}")


async def _handle_list_files(
    path: str | None = None,
    pattern: str | None = None,
    **kwargs: Any,
) -> ToolResult:
    try:
        base = Path(path or ".").expanduser().resolve()
        if not base.exists():
            return ToolResult(success=False, output=f"Directory not found: {base}")
        if not base.is_dir():
            return ToolResult(success=False, output=f"Not a directory: {base}")
        pat = pattern or "*"
        matches = sorted(base.glob(pat))[:100]
        if not matches:
            return ToolResult(
                success=True,
                output=f"No files matching '{pat}' in {base}",
                data={"files": []},
            )
        lines = []
        for m in matches:
            if m.is_dir():
                lines.append(f"  {m.name}/")
            else:
                size = m.stat().st_size
                lines.append(f"  {m.name}  ({size:,} bytes)")
        return ToolResult(
            success=True,
            output=f"Files in {base} matching '{pat}':\n" + "\n".join(lines),
            data={"files": [str(m) for m in matches]},
        )
    except (OSError, PermissionError) as e:
        logger.error("tool_list_files_error", error=str(e))
        return ToolResult(success=False, output=f"Failed to list files: {e}")


def _fuzzy_match_hunk(lines: list[str], old_lines: list[str], start: int) -> int | None:
    best_pos: int | None = None
    best_score = -1
    old_len = len(old_lines)
    if old_len == 0:
        return None
    search_end = min(len(lines), start + old_len + 30)
    for i in range(max(0, start - 10), search_end):
        if i + old_len > len(lines):
            break
        score = 0
        for j in range(old_len):
            a = lines[i + j]
            b = old_lines[j]
            a_strip = a.strip()
            b_strip = b.strip()
            if a == b:
                score += 4
            elif a_strip == b_strip:
                score += 3
            elif a_strip == b_strip.replace("\t", "    ") or b_strip == a_strip.replace("\t", "    "):
                score += 3
            elif _token_overlap(a_strip, b_strip) > 0.5:
                score += 2
            elif difflib.SequenceMatcher(None, a_strip, b_strip).ratio() > 0.6:
                score += 1
        if score > best_score:
            best_score = score
            best_pos = i
    threshold = max(old_len * 1.5, old_len + 2)
    if best_pos is not None and best_score >= threshold:
        return best_pos
    if best_pos is not None and best_score >= old_len and old_len <= 3:
        return best_pos
    return None


def _token_overlap(a: str, b: str) -> float:
    ta = set(a.split())
    tb = set(b.split())
    if not ta and not tb:
        return 1.0
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / max(len(ta | tb), 1)


async def _handle_write_file(
    path: str | None = None,
    content: str | None = None,
    create_dirs: bool = True,
    **kwargs: Any,
) -> ToolResult:
    if not path:
        return ToolResult(success=False, output="path is required.")
    if content is None:
        return ToolResult(success=False, output="content is required.")
    try:
        p = Path(path).expanduser().resolve()
        existed = p.exists()
        if create_dirs:
            p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        _invalidate_cache(p)
        size = p.stat().st_size
        action = "Updated" if existed else "Created"
        logger.info("tool_wrote_file", path=str(p), size=size, new=not existed)
        return ToolResult(
            success=True,
            output=f"{action} {p} ({size:,} bytes)",
            data={"path": str(p), "size": size, "existed": existed},
        )
    except (OSError, UnicodeEncodeError) as e:
        logger.error("tool_write_file_error", error=str(e))
        return ToolResult(success=False, output=f"Failed to write file: {e}")


async def _handle_patch(
    path: str | None = None,
    old: str | None = None,
    new: str | None = None,
    **kwargs: Any,
) -> ToolResult:
    if not path:
        return ToolResult(success=False, output="path is required.")
    if old is None or new is None:
        return ToolResult(success=False, output="old and new are both required.")
    try:
        p = Path(path).expanduser().resolve()
        if not p.exists():
            return ToolResult(success=False, output=f"File not found: {p}")
        if not p.is_file():
            return ToolResult(success=False, output=f"Not a file: {p}")

        content = _get_cached_content(p)
        if content is None:
            content = p.read_text(encoding="utf-8", errors="replace")

        if old in content:
            count = content.count(old)
            if count > 1:
                return ToolResult(
                    success=False,
                    output=f"Found {count} matches for old text. Provide more context to make it unique.",
                    data={"matches": count},
                )
            patched = content.replace(old, new, 1)
            p.write_text(patched, encoding="utf-8")
            _invalidate_cache(p)
            old_start = content[: content.index(old)].count("\n") + 1
            logger.info("tool_patched_file", path=str(p), line=old_start, mode="exact")
            return ToolResult(
                success=True,
                output=f"Patched {p} (line {old_start}, exact match)",
                data={"path": str(p), "line": old_start},
            )

        lines = content.splitlines()
        old_lines = old.splitlines()
        content_start = 0
        best_first_line_score = 0.0
        for i, line in enumerate(lines):
            stripped = line.strip()
            old_first = old_lines[0].strip()
            if stripped == old_first:
                content_start = i
                break
            score = difflib.SequenceMatcher(None, stripped, old_first).ratio()
            if score > best_first_line_score:
                best_first_line_score = score
                content_start = i

        pos = _fuzzy_match_hunk(lines, old_lines, content_start)
        if pos is None:
            _show_context = "\n".join(
                f"{i+1}: {lines[i]}" for i in range(max(0, content_start - 2), min(len(lines), content_start + 5))
            )
            return ToolResult(
                success=False,
                output=(
                    f"Could not find a matching location for the old text in {p}.\n"
                    f"Check indentation, whitespace, or provide more surrounding context.\n"
                    f"Nearby lines (around expected position {content_start + 1}):\n{_show_context}"
                ),
            )
        new_lines = new.splitlines()
        lines[pos : pos + len(old_lines)] = new_lines
        patched = "\n".join(lines)
        p.write_text(patched, encoding="utf-8")
        _invalidate_cache(p)
        logger.info("tool_patched_file", path=str(p), line=pos + 1, mode="fuzzy")
        return ToolResult(
            success=True,
            output=f"Patched {p} (line {pos + 1}, fuzzy match)",
            data={"path": str(p), "line": pos + 1},
        )
    except (OSError, UnicodeDecodeError, UnicodeEncodeError) as e:
        logger.error("tool_patch_file_error", error=str(e))
        return ToolResult(success=False, output=f"Failed to patch file: {e}")


async def _handle_search_files(
    query: str | None = None,
    path: str | None = None,
    file_pattern: str | None = None,
    **kwargs: Any,
) -> ToolResult:
    if not query:
        return ToolResult(success=False, output="query is required.")
    try:
        import subprocess

        base = Path(path or ".").expanduser().resolve()
        if not base.exists():
            return ToolResult(success=False, output=f"Directory not found: {base}")
        cmd = ["rg", "--no-heading", "-n", "--max-count", "50"]
        if file_pattern:
            cmd.extend(["--glob", file_pattern])
        cmd.append(query)
        cmd.append(str(base))
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if proc.returncode == 2:
            return ToolResult(
                success=False, output=f"Search error: {proc.stderr[:500]}"
            )
        if proc.returncode == 1 or not proc.stdout.strip():
            return ToolResult(
                success=True,
                output=f"No matches found for '{query}' in {base}",
                data={"matches": [], "count": 0},
            )
        output = proc.stdout.strip()
        if len(output) > 30000:
            lines = output.splitlines()
            head = "\n".join(lines[:40])
            tail = "\n".join(lines[-10:])
            output = f"{head}\n... ({len(lines) - 50} matches omitted) ...\n{tail}"
        match_count = output.count("\n") + 1
        return ToolResult(
            success=True,
            output=output,
            data={"matches": match_count, "query": query, "path": str(base)},
        )
    except FileNotFoundError:
        return ToolResult(
            success=False,
            output="ripgrep (rg) is not installed. Install it or use terminal with grep.",
        )
    except subprocess.TimeoutExpired:
        return ToolResult(success=False, output="Search timed out after 15 seconds.")
    except Exception as e:
        return ToolResult(success=False, output=f"Failed to search files: {e}")
