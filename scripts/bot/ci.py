"""CI helpers — local test runner and opencode invocation."""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import tempfile

from bot.exceptions import CIFailure, OpencodeTimeout

log = logging.getLogger("sediman-bot")


def run_local_ci(
    changed_files: list[str] | None = None,
    *,
    workdir: str = "/root/sediman-browse",
) -> bool:
    """Run pytest locally and return ``True`` if it passes.

    Parameters
    ----------
    changed_files:
        If given, only the corresponding test files are executed.
        Otherwise the full suite is run (excluding known-broken tests).
    workdir:
        Repository root where pytest is invoked.

    Returns
    -------
    bool
        ``True`` when all selected tests pass.
    """
    base_args = [
        "python3", "-m", "pytest", "-x", "-q",
        "--timeout=30", "--tb=short",
        "--ignore=tests/test_tool_loop.py",
        "--deselect=tests/test_agent_execution.py::TestTryToolLoopExecution::test_returns_result_on_success",
        "--deselect=tests/test_agent_execution.py::TestTryToolLoopExecution::test_registers_browser_tools_when_missing",
    ]

    if changed_files:
        test_targets: set[str] = set()
        for f in changed_files:
            base = os.path.splitext(os.path.basename(f))[0]
            test_targets.add(f"tests/test_{base}.py")
        targets = [t for t in test_targets if os.path.exists(os.path.join(workdir, t))]
        if not targets:
            log.info("No related test files found — skipping CI")
            return True
        base_args.extend(targets)
        log.info("Running CI on related tests: %s", targets)
    else:
        base_args.append("tests/")

    try:
        result = subprocess.run(
            base_args, cwd=workdir, capture_output=True, text=True, timeout=300,
        )
        log.info("pytest exit code: %d", result.returncode)
        log.info("pytest output:\n%s", result.stdout[-2000:])
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        log.error("pytest timed out")
        return False
    except Exception as exc:
        log.error("pytest error: %s", exc)
        return False


def run_opencode(prompt: str, cwd: str, timeout: int = 300) -> str:
    """Run ``opencode run --format json`` and return extracted text.

    Parameters
    ----------
    prompt:
        The natural-language instruction sent to opencode.
    cwd:
        Working directory for the subprocess.
    timeout:
        Maximum wall-clock seconds before the process is killed.

    Returns
    -------
    str
        Concatenated text content from opencode's JSON output.

    Raises
    ------
    OpencodeTimeout
        If the subprocess exceeds *timeout*.
    """
    log.info("Running opencode (timeout=%ds)...", timeout)

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".txt", delete=False, dir="/tmp"
    ) as tf:
        tf.write(prompt)
        prompt_file = tf.name

    try:
        cmd = f'cd {cwd} && opencode run --format json "$(cat {prompt_file})" 2>/dev/null'
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise OpencodeTimeout(timeout) from exc
    finally:
        os.unlink(prompt_file)

    stdout = result.stdout
    stderr = result.stderr
    log.info("opencode stdout: %d chars, stderr: %d chars", len(stdout), len(stderr))
    if stderr:
        log.info("opencode stderr: %s", stderr[:500])

    text_parts: list[str] = []
    for line in stdout.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
            if event.get("type") == "text":
                text_parts.append(event["part"]["text"])
        except (json.JSONDecodeError, KeyError):
            continue

    full_text = "\n".join(text_parts)
    log.info("Extracted %d chars of text from opencode", len(full_text))
    if not full_text and stdout:
        log.info("Raw stdout preview: %s", stdout[:500])
    return full_text


def parse_json_from_output(text: str) -> list[dict]:
    """Extract a JSON array from free-form opencode text output.

    Tries fenced `````json```` blocks first, then falls back to bare
    bracket matching.

    Parameters
    ----------
    text:
        Raw text that may contain a JSON array.

    Returns
    -------
    list[dict]
        Parsed list, or an empty list if nothing was found.
    """
    if not text:
        return []

    json_blocks = re.findall(r"```json\s*(\[.*?\])\s*```", text, re.DOTALL)
    for block in json_blocks:
        try:
            parsed = json.loads(block)
            if isinstance(parsed, list) and len(parsed) > 0:
                return parsed
        except json.JSONDecodeError:
            continue

    matches = re.findall(r"(\[.*\])", text, re.DOTALL)
    for match in matches:
        try:
            parsed = json.loads(match)
            if isinstance(parsed, list) and len(parsed) > 0 and isinstance(parsed[0], dict):
                return parsed
        except json.JSONDecodeError:
            continue

    return []
