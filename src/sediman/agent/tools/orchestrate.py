"""Search orchestration tool handler.

This module provides the _handle_search_orchestrate function that executes
Python code with access to the SearchSDK.
"""

from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path
from typing import Any

import structlog

from sediman.agent.tool_dispatch import ToolResult

logger = structlog.get_logger()


async def _handle_search_orchestrate(code: str, **kwargs: Any) -> ToolResult:
    """Execute complex search pipelines using SearchSDK.

    The model provides Python code that has access to the SearchSDK with
    retrieve, filter, extract, and state subsystems.

    Args:
        code: Python code to execute
        **kwargs: Additional parameters (ignored)

    Returns:
        ToolResult with execution output or error

    Example code the model might provide:
        ```python
        queries = ["python async", "golang async"]
        hits = await sdk.retrieve.web_many(queries, concurrency=2)
        filtered = sdk.filter.by_domain(hits, exclude=["spam.com"])
        results = await sdk.extract.extract_many(filtered, schema={"lang": str})
        return results
        ```
    """
    if not code or not code.strip():
        return ToolResult(success=False, output="Code is required")

    # Wrap code with SDK imports
    wrapped_code = f"""
import asyncio
import sys
sys.path.insert(0, r'{Path(__file__).parent.parent.parent.parent}')

from sediman.search.sdk import SearchSDK

async def main():
    sdk = SearchSDK()

    try:
        result = await asyncio.create_task(exec(__import__(\"builtins\").exec(code)))
        return result
    except Exception as e:
        return str(e)

# Execute the user's code
asyncio.run(main())
"""

    # Create temp file for the code
    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
        f.write(wrapped_code)
        script_path = f.name

    try:
        # Execute in subprocess with timeout
        proc = await asyncio.create_subprocess_exec(
            Path(sys.executable).name / "python",
            script_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=60.0,
            )

            if stderr and stderr.strip():
                # Check if it's an error
                error_output = stderr.decode()
                if "Error" in error_output or "Exception" in error_output:
                    return ToolResult(
                        success=False,
                        output=f"Search orchestration failed:\n{error_output}",
                    )

            # Get output
            output = stdout.decode()

            # Limit output size
            if len(output) > 50000:
                output = output[:50000] + "\n... (output truncated)"

            return ToolResult(
                success=True,
                output=f"Search orchestration completed:\n{output}",
                data={"output_length": len(stdout)},
            )

        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            return ToolResult(
                success=False,
                output="Search orchestration timed out after 60 seconds",
            )

    except Exception as e:
        logger.error("search_orchestrate_error", error=str(e))
        return ToolResult(
            success=False,
            output=f"Search orchestration error: {e}",
        )

    finally:
        # Clean up temp file
        try:
            Path(script_path).unlink()
        except Exception:
            pass


__all__ = ["_handle_search_orchestrate"]
