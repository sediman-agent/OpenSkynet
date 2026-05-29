from __future__ import annotations

from typing import Any

import structlog

from sediman.agent.sandbox_runner import SandboxRunner, get_sandbox_dirs
from sediman.agent.tool_dispatch import ToolResult

logger = structlog.get_logger()

_runner: SandboxRunner | None = None


def _get_runner() -> SandboxRunner:
    global _runner
    if _runner is None:
        _runner = SandboxRunner()
    return _runner


async def _handle_terminal(
    command: str | None = None,
    cwd: str | None = None,
    timeout: int = 30,
    allow_net: bool = False,
    **kwargs: Any,
) -> ToolResult:
    if not command or not command.strip():
        return ToolResult(success=False, output="command is required.")

    command = command.strip()
    timeout = max(1, min(timeout, 180))

    from ..tools import _terminal_session_allowed, _terminal_approval_callback
    if not _terminal_session_allowed:
        if _terminal_approval_callback is not None:
            approved = await _terminal_approval_callback(command, cwd or ".")
            if not approved:
                return ToolResult(
                    success=False,
                    output=f"Command not approved: {command[:100]}",
                    data={"command": command, "denied": True},
                )
        else:
            return ToolResult(
                success=False,
                output="Terminal access not available. No approval mechanism configured.",
                data={"command": command, "denied": True},
            )

    runner = _get_runner()
    allow_dirs = get_sandbox_dirs(cwd)

    result = await runner.run(
        command=command,
        cwd=cwd,
        timeout=timeout,
        allow_dirs=allow_dirs,
        allow_net=allow_net,
    )

    if not result.sandboxed:
        logger.warning(
            "terminal_ran_without_sandbox",
            command=command[:80],
        )

    output = result.output
    if len(output) > 10000:
        output = output[:10000] + "\n... (output truncated)"

    return ToolResult(
        success=result.success,
        output=output,
        data={
            "command": command,
            "exit_code": result.exit_code,
            "sandboxed": result.sandboxed,
            "timed_out": result.timed_out,
        },
    )
