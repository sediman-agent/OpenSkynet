from __future__ import annotations

import asyncio
import json
from typing import Any, Callable

import structlog

from sediman.agentbrowser.process import AgentBrowserProcess

logger = structlog.get_logger()


class AgentBrowserClient:
    def __init__(self, process: AgentBrowserProcess):
        self._process = process
        self._request_id = 0
        self._pending: dict[int, asyncio.Future[dict[str, Any]]] = {}
        self._notifications: list[dict[str, Any]] = []
        self._on_notification: Callable[[dict[str, Any]], None] | None = None
        self._reader_task: asyncio.Task[None] | None = None
        self._initialized = False

    def set_notification_handler(self, handler: Callable[[dict[str, Any]], None]) -> None:
        self._on_notification = handler

    async def _ensure_reader(self) -> None:
        if self._reader_task is not None:
            return
        stdout = self._process.stdout
        if not stdout:
            return
        self._reader_task = asyncio.create_task(self._read_loop(stdout))

    async def _read_loop(self, stdout: asyncio.StreamReader) -> None:
        while True:
            try:
                line = await stdout.readline()
                if not line:
                    break
                text = line.decode(errors="replace").strip()
                if not text:
                    continue
                try:
                    msg = json.loads(text)
                except json.JSONDecodeError:
                    continue

                if "id" in msg and "method" not in msg:
                    msg_id = msg.get("id", 0)
                    future = self._pending.pop(msg_id, None)
                    if future and not future.done():
                        future.set_result(msg)
                elif "method" in msg:
                    self._notifications.append(msg)
                    if self._on_notification:
                        try:
                            self._on_notification(msg)
                        except Exception:
                            logger.debug("notification_handler_failed")
            except Exception:
                break

    async def _send_request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        await self._ensure_reader()
        stdin = self._process.stdin
        if not stdin:
            raise RuntimeError("agent-browser process stdin not available")

        self._request_id += 1
        request_id = self._request_id

        request: dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
        }
        if params:
            request["params"] = params

        loop = asyncio.get_event_loop()
        future: asyncio.Future[dict[str, Any]] = loop.create_future()
        self._pending[request_id] = future

        line = json.dumps(request) + "\n"
        stdin.write(line.encode())
        await stdin.drain()

        try:
            return await asyncio.wait_for(future, timeout=300.0)
        except TimeoutError:
            self._pending.pop(request_id, None)
            raise

    def _send_notification(self, method: str, params: dict[str, Any] | None = None) -> None:
        stdin = self._process.stdin
        if not stdin:
            return
        notification: dict[str, Any] = {"jsonrpc": "2.0", "method": method}
        if params:
            notification["params"] = params
        try:
            line = json.dumps(notification) + "\n"
            stdin.write(line.encode())
            loop = asyncio.get_event_loop()
            loop.create_task(self._drain_stdin(stdin))
        except Exception:
            logger.debug("send_notification_failed")

    @staticmethod
    async def _drain_stdin(stdin: asyncio.StreamWriter) -> None:
        try:
            await stdin.drain()
        except Exception:
            logger.debug("drain_stdin_failed")

    async def init(
        self,
        api_key: str,
        model: str = "gpt-4",
        base_url: str | None = None,
        max_rounds: int = 50,
        custom_instructions: str | None = None,
    ) -> bool:
        params: dict[str, Any] = {
            "apiKey": api_key,
            "model": model,
            "maxRounds": max_rounds,
        }
        if base_url:
            params["baseURL"] = base_url
        if custom_instructions:
            params["customInstructions"] = custom_instructions

        response = await self._send_request("agent.init", params)

        if "error" in response:
            error = response.get("error", {})
            logger.error("agent_browser_init_failed", error=error)
            return False

        self._initialized = True
        logger.info("agent_browser_initialized")
        return True

    async def chat(self, message: str) -> str:
        response = await self._send_request("agent.chat", {"message": message})

        if "error" in response:
            error = response.get("error", {})
            msg = error.get("message", str(error))
            logger.error("agent_browser_chat_failed", error=msg)
            return f"Agent-browser error: {msg}"

        result = response.get("result", {})
        if isinstance(result, dict):
            return result.get("content", "")
        return str(result)

    async def stop(self) -> None:
        try:
            await self._send_request("agent.stop")
        except Exception:
            logger.debug("agent_stop_failed")

    async def get_history(self) -> list[dict[str, Any]]:
        response = await self._send_request("agent.getHistory")
        if "error" in response:
            return []
        result = response.get("result", {})
        if isinstance(result, dict):
            return result.get("history", [])
        return []

    async def shutdown(self) -> None:
        try:
            await self._send_request("agent.shutdown")
        except Exception:
            logger.debug("agent_shutdown_failed")

    @property
    def is_initialized(self) -> bool:
        return self._initialized

    async def close(self) -> None:
        await self.shutdown()
        if self._reader_task:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass
            self._reader_task = None
        self._pending.clear()
