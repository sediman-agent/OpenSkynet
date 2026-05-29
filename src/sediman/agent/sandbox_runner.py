"""Sandbox runner — wraps sediman-sandbox CLI for isolated command execution.

Replaces direct subprocess calls with sandboxed execution via the Go wrapper.
Every terminal command MUST go through SandboxRunner — no raw subprocess.
"""
from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from pathlib import Path

import structlog

logger = structlog.get_logger()


@dataclass
class SandboxResult:
    success: bool
    output: str
    exit_code: int
    timed_out: bool = False
    sandboxed: bool = True


class SandboxRunner:
    """Runs shell commands inside sediman-sandbox for filesystem isolation.

    If the sandbox binary is not available, falls back to raw subprocess
    with a warning logged. This is a security risk — operators should
    install sediman-sandbox.
    """

    def __init__(self, cli: str | None = None) -> None:
        self.cli = cli or self._find_cli()
        self.available = Path(self.cli).exists()
        if not self.available:
            logger.warning(
                "sandbox_binary_not_found",
                searched=str(self.cli),
                message="sediman-sandbox not found. Terminal commands will run without isolation!",
            )

    def _find_cli(self) -> str:
        for name in ("sediman-sandbox",):
            if p := shutil_which(name):
                return p
        for p in (
            Path.home() / ".local" / "bin" / "sediman-sandbox",
            Path.home() / ".sediman" / "sandbox" / "sediman-sandbox",
            Path("/usr/local/bin/sediman-sandbox"),
        ):
            if p.exists():
                return str(p)
        return "sediman-sandbox"

    async def run(
        self,
        command: str,
        cwd: str | None = None,
        timeout: int = 30,
        allow_dirs: list[str] | None = None,
        allow_net: bool = False,
        max_memory_mb: int = 0,
        max_cpu_pct: int = 0,
    ) -> SandboxResult:
        """Run a command inside the sandbox.

        Args:
            command: Shell command to execute.
            cwd: Working directory.
            timeout: Max execution time in seconds.
            allow_dirs: Directories the command can read/write.
            allow_net: Whether to allow network access.
            max_memory_mb: Memory limit in MB (0 = no limit).
            max_cpu_pct: CPU limit as percentage (0 = no limit).

        Returns:
            SandboxResult with success, output, exit_code, and metadata.
        """
        if not self.available:
            return await self._run_fallback(command, cwd, timeout)

        args = [
            self.cli,
            "run",
            f"--timeout={timeout}s",
        ]
        if allow_net:
            args.append("--allow-net")
        if max_memory_mb > 0:
            args.append(f"--max-memory={max_memory_mb}mb")
        if max_cpu_pct > 0:
            args.append(f"--max-cpu={max_cpu_pct}%")
        for d in allow_dirs or []:
            args.append(f"--allow-dir={d}")
        if cwd:
            args.append(f"--work-dir={cwd}")

        args.extend(["--", "bash", "-c", command])

        try:
            proc = await asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout + 5)
            output = ""
            if stdout:
                output += stdout.decode(errors="replace")
            if stderr:
                output += stderr.decode(errors="replace")
            return SandboxResult(
                success=proc.returncode == 0,
                output=output,
                exit_code=proc.returncode or 0,
                sandboxed=True,
            )
        except asyncio.TimeoutError:
            return SandboxResult(
                success=False,
                output=f"Sandbox timed out after {timeout}s",
                exit_code=124,
                timed_out=True,
                sandboxed=True,
            )
        except Exception as e:
            logger.warning("sandbox_run_failed", command=command[:80], error=str(e))
            return SandboxResult(
                success=False,
                output=f"Sandbox error: {e}",
                exit_code=1,
                sandboxed=True,
            )

    async def _run_fallback(
        self,
        command: str,
        cwd: str | None = None,
        timeout: int = 30,
    ) -> SandboxResult:
        """Fallback: run without sandbox when binary is unavailable."""
        logger.warning(
            "sandbox_fallback_raw_subprocess",
            command=command[:80],
            message="Running without sandbox isolation! Install sediman-sandbox.",
        )
        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd or None,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            parts: list[str] = []
            if stdout:
                parts.append(stdout.decode(errors="replace"))
            if stderr:
                parts.append(stderr.decode(errors="replace"))
            output = "\n".join(parts) if parts else "(no output)"
            if proc.returncode != 0:
                output += f"\n[exit code: {proc.returncode}]"
            if len(output) > 10000:
                output = output[:10000] + "\n... (output truncated)"
            return SandboxResult(
                success=proc.returncode == 0,
                output=output,
                exit_code=proc.returncode or 0,
                sandboxed=False,
            )
        except asyncio.TimeoutError:
            return SandboxResult(
                success=False,
                output=f"Command timed out after {timeout}s",
                exit_code=124,
                timed_out=True,
                sandboxed=False,
            )
        except (OSError, asyncio.CancelledError) as e:
            logger.error("terminal_execution_error", command=command[:80], error=str(e))
            return SandboxResult(
                success=False,
                output=f"Command failed: {e}",
                exit_code=1,
                sandboxed=False,
            )


def get_sandbox_dirs(cwd: str | None) -> list[str]:
    """Determine which directories to allow based on cwd."""
    dirs: list[str] = []
    if cwd and cwd != ".":
        dirs.append(os.path.abspath(cwd))
    proj = os.getcwd()
    if proj not in dirs:
        dirs.append(proj)
    if "/tmp" not in dirs:
        dirs.append("/tmp")
    return dirs


def shutil_which(cmd: str) -> str | None:
    try:
        import shutil
        return shutil.which(cmd)
    except Exception:
        return None
