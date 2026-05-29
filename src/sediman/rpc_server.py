"""Unix socket JSON-RPC 2.0 server for the Python backend.

Called by the TS RPC server via callPython() in proxy.ts.
Provides agent.run, system.*, skills.run, model.*, terminal.*, record.* handlers.

Usage:
    python -m sediman.rpc_server
    SEDIMAN_PYTHON_SOCKET=/tmp/my-python.sock python -m sediman.rpc_server
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import time
import traceback
from typing import Any, Callable

import structlog

from sediman.agent.interrupt import InterruptSignal
from sediman.agent.loop import AgentLoop, AgentResult, StepEvent
from sediman.browser.session import BrowserSession
from sediman.llm.provider import create_provider, LLMProvider, PROVIDERS

logger = structlog.get_logger()

SOCKET = os.environ.get("SEDIMAN_PYTHON_SOCKET", "/tmp/sediman-python.sock")
MAX_TASK_LENGTH = 10000

# Lazy-initialized shared state (mirrors api/app.py pattern)
_browser: BrowserSession | None = None
_llm: LLMProvider | None = None
_agent_loop: AgentLoop | None = None
_llm_config: dict[str, Any] = {}
_agent_loop_lock = asyncio.Lock()
_browser_lock = asyncio.Lock()


# ── Initialization ─────────────────────────────────────────────────

def init_state(
    provider: str = "openai",
    model: str | None = None,
    base_url: str | None = None,
    terminal: bool = False,
) -> None:
    global _llm_config
    _llm_config = {
        "provider": provider,
        "model": model,
        "base_url": base_url,
        "terminal": terminal,
    }


def _get_llm() -> LLMProvider:
    global _llm
    if _llm is None:
        _llm = create_provider(**_llm_config)
    return _llm


async def _get_browser() -> BrowserSession:
    global _browser
    if _browser is None:
        async with _browser_lock:
            if _browser is None:
                from sediman.config import STEALTH_ENABLED, STEALTH_PROXY

                _browser = BrowserSession(
                    headless=False,
                    stealth=STEALTH_ENABLED,
                    proxy=STEALTH_PROXY or None,
                )
                await _browser.start()
    return _browser


async def _get_agent_loop() -> AgentLoop:
    global _agent_loop
    if _agent_loop is None:
        async with _agent_loop_lock:
            if _agent_loop is None:
                from sediman.agent.tools import set_terminal_allowed

                browser = await _get_browser()
                llm = _get_llm()
                _agent_loop = AgentLoop(llm_provider=llm, browser_session=browser)
                if _llm_config.get("terminal"):
                    set_terminal_allowed(True)
    return _agent_loop


def _reset_state() -> None:
    global _browser, _llm, _agent_loop
    _browser = None
    _llm = None
    _agent_loop = None


async def _shutdown() -> None:
    global _browser, _agent_loop
    if _browser:
        try:
            await _browser.close()
        except Exception:
            pass
        _browser = None
    _agent_loop = None


# ── Handlers ───────────────────────────────────────────────────────

async def handle_system_status(params: dict[str, Any], notify: NotifyFn | None = None) -> dict[str, Any]:
    browser = _browser
    llm = _llm
    agent = _agent_loop
    return {
        "browser_open": browser is not None and browser.is_running,
        "model": os.environ.get("SEDIMAN_MODEL") if not llm else getattr(llm, "model", None),
        "provider": _llm_config.get("provider", os.environ.get("SEDIMAN_PROVIDER", "openai")),
        "conversation_messages": len(getattr(agent, "_conversation", [])),
        "current_task": None,
        "scheduler": {"active_jobs": 0, "total_jobs": 0},
        "last_result": None,
        "queue_size": 0,
    }


async def handle_system_screenshot(params: dict[str, Any], notify: NotifyFn | None = None) -> dict[str, Any]:
    browser = await _get_browser()
    screenshot = await browser.take_screenshot()
    if not screenshot:
        raise RuntimeError("No browser screenshot available")
    return {"screenshot": screenshot}


async def handle_system_btw(params: dict[str, Any], notify: NotifyFn | None = None) -> dict[str, Any]:
    question = params.get("question", "")
    if not question:
        raise ValueError("question is required")
    from sediman.llm.provider import create_provider

    llm = create_provider(**_llm_config)
    system_msg = {"role": "system", "content": "You are a helpful assistant. Answer concisely."}
    msg = {"role": "user", "content": question}
    response = await llm.chat(messages=[system_msg, msg], tools=[])
    return {"answer": response.text}


async def handle_system_doctor(params: dict[str, Any], notify: NotifyFn | None = None) -> dict[str, Any]:
    checks = {}
    for binary in ["google-chrome", "chromium", "python3"]:
        checks[binary] = shutil.which(binary) is not None
    checks["cloakbrowser"] = bool(os.environ.get("CLOAKBROWSER_BINARY"))
    checks["browser_running"] = _browser is not None and getattr(_browser, "is_running", False)
    checks["llm_configured"] = _llm is not None or bool(_llm_config)
    return {"checks": checks}


async def handle_agent_run(params: dict[str, Any], notify: NotifyFn | None = None) -> dict[str, Any]:
    task = (params.get("task") or "").strip()
    if not task:
        raise ValueError("task is required")
    if len(task) > MAX_TASK_LENGTH:
        raise ValueError(f"Task exceeds max length of {MAX_TASK_LENGTH}")

    agent = await _get_agent_loop()

    if notify:
        original_on_step = agent.on_step

        def stepping(event: StepEvent) -> None:
            try:
                notify("chat.progress", {
                    "phase": event.phase or "executing",
                    "action": event.action or "",
                    "url": event.observation or "",
                    "step": event.step,
                })
            except Exception:
                pass
            if original_on_step:
                original_on_step(event)

        agent.on_step = stepping

    InterruptSignal.get().clear()

    try:
        result: AgentResult = await agent.run(task)
    except InterruptedError:
        return {
            "result": "Task cancelled by user.",
            "steps": [],
            "skill_created": None,
            "elapsed_secs": 0,
            "strategy_used": "cancelled",
        }
    finally:
        if notify:
            agent.on_step = original_on_step if notify else agent.on_step

    return {
        "result": result.result or "",
        "steps": [{"action": s.action, "observation": s.observation, "phase": s.phase} for s in (result.steps or [])],
        "skill_created": result.skill_created,
        "actions_taken": result.actions_taken or [],
        "scheduled_job_id": result.scheduled_job_id,
        "schedule_cron": result.schedule_cron,
        "iterations": result.iterations or 0,
        "strategy_used": result.strategy_used or "direct",
        "elapsed_secs": 0,
    }


async def handle_agent_cancel(params: dict[str, Any], notify: NotifyFn | None = None) -> dict[str, Any]:
    InterruptSignal.get().trigger("Cancelled by user via RPC")
    return {"cancelled": True}


async def handle_skills_run(params: dict[str, Any], notify: NotifyFn | None = None) -> dict[str, Any]:
    name = (params.get("name") or "").strip()
    if not name:
        raise ValueError("skill name is required")

    from sediman.skills.engine import SkillEngine

    engine = SkillEngine()
    skill = engine.get_skill(name)
    if not skill:
        raise ValueError(f"Skill '{name}' not found")

    browser = await _get_browser()
    llm = _get_llm()
    from sediman.skills.executor import execute_skill

    result_text = await execute_skill(skill=skill, browser_session=browser, llm=llm)
    return {"result": result_text}


async def handle_model_switch(params: dict[str, Any], notify: NotifyFn | None = None) -> dict[str, Any]:
    provider = (params.get("provider") or "").strip()
    model = (params.get("model") or "").strip() or None
    if not provider:
        raise ValueError("provider is required")
    _llm_config["provider"] = provider
    if model:
        _llm_config["model"] = model
    _reset_state()
    return {"provider": provider, "model": model}


async def handle_model_list_providers(params: dict[str, Any], notify: NotifyFn | None = None) -> dict[str, Any]:
    providers = []
    for name, cfg in PROVIDERS.items():
        providers.append({"name": name, "default_model": cfg.get("model"), "default_base_url": cfg.get("base_url")})
    return {"providers": providers}


async def handle_terminal_set(params: dict[str, Any], notify: NotifyFn | None = None) -> dict[str, Any]:
    from sediman.agent.tools import set_terminal_allowed
    allowed = bool(params.get("allowed", False))
    set_terminal_allowed(allowed)
    return {"allowed": allowed}


async def handle_terminal_status(params: dict[str, Any], notify: NotifyFn | None = None) -> dict[str, Any]:
    from sediman.agent.tools import is_terminal_allowed
    return {"allowed": is_terminal_allowed()}


async def handle_record_start(params: dict[str, Any], notify: NotifyFn | None = None) -> dict[str, Any]:
    name = (params.get("name") or "").strip()
    if not name:
        raise ValueError("recording name is required")
    browser = await _get_browser()
    from sediman.agent.recording_manager import RecordingManager

    mgr = RecordingManager.get_instance()
    session = await mgr.start_recording(name=name, browser=browser)
    return {"session_id": session.id, "name": session.name, "started_at": str(session.started_at)}


async def handle_record_stop(params: dict[str, Any], notify: NotifyFn | None = None) -> dict[str, Any]:
    session_id = (params.get("session_id") or "").strip()
    if not session_id:
        raise ValueError("session_id is required")
    from sediman.agent.recording_manager import RecordingManager

    mgr = RecordingManager.get_instance()
    session = await mgr.stop_by_session_id(session_id)
    if not session:
        raise ValueError(f"Recording session '{session_id}' not found")

    from sediman.skills.trace_to_skill import TraceToSkill
    from sediman.skills.engine import SkillEngine

    skill_engine = SkillEngine()
    llm = _get_llm()
    converter = TraceToSkill(llm)
    try:
        result = await converter.convert(recording=session)
        skill_name = result.get("name", session.name)
        skill_data = result.get("skill", {})
        skill_engine.ensure_skill(skill_name, skill_data)
        return {"session_id": session_id, "skill_created": skill_name, "message": f"Skill '{skill_name}' created"}
    except Exception as e:
        return {"session_id": session_id, "skill_created": None, "message": f"Recording stopped but skill creation failed: {e}"}


async def handle_record_active(params: dict[str, Any], notify: NotifyFn | None = None) -> dict[str, Any]:
    from sediman.agent.recording_manager import RecordingManager

    mgr = RecordingManager.get_instance()
    sessions = mgr.get_active_sessions()
    recordings = []
    for s in sessions:
        recordings.append({
            "session_id": s.id,
            "name": s.name,
            "started_at": str(s.started_at),
            "frame_count": len(getattr(s, "frames", [])),
            "duration_seconds": 0,
            "action_count": len(getattr(s, "actions", [])),
        })
    return {"recordings": recordings}


async def handle_integration_list(params: dict[str, Any], notify: NotifyFn | None = None) -> dict[str, Any]:
    from sediman.integrations import list_integrations
    return {"integrations": list_integrations()}


async def handle_integration_configure(params: dict[str, Any], notify: NotifyFn | None = None) -> dict[str, Any]:
    name = (params.get("name") or "").strip()
    if not name:
        raise ValueError("integration name is required")
    from sediman.integrations import update_config
    updates = {k: v for k, v in params.items() if k != "name" and v is not None}
    result = update_config(name, updates)
    return {"integration": name, "config": result}


async def handle_integration_send(params: dict[str, Any], notify: NotifyFn | None = None) -> dict[str, Any]:
    integration = (params.get("integration") or "").strip()
    target = (params.get("target") or "").strip()
    content = (params.get("content") or "").strip()
    if not integration or not target or not content:
        raise ValueError("integration, target, and content are required")
    from sediman.integrations import send_message
    result = await send_message(integration, target, content)
    return {"result": result}


async def handle_integration_status(params: dict[str, Any], notify: NotifyFn | None = None) -> dict[str, Any]:
    from sediman.integrations import get_integration, get_config
    name = (params.get("name") or "").strip()
    if not name:
        raise ValueError("integration name is required")
    inst = get_integration(name)
    config = get_config().get(name, {})
    return {
        "name": name,
        "enabled": config.get("enabled", False),
        "configured": bool(config.get("token")),
        "connected": inst is not None and inst.enabled,
    }


# ── Dispatching ────────────────────────────────────────────────────

NotifyFn = Callable[[str, dict[str, Any]], None]

HANDLERS: dict[str, Callable] = {
    "system.status": handle_system_status,
    "system.screenshot": handle_system_screenshot,
    "system.btw": handle_system_btw,
    "system.doctor": handle_system_doctor,
    "agent.run": handle_agent_run,
    "agent.cancel": handle_agent_cancel,
    "skills.run": handle_skills_run,
    "model.switch": handle_model_switch,
    "model.list_providers": handle_model_list_providers,
    "terminal.set": handle_terminal_set,
    "terminal.status": handle_terminal_status,
    "record.start": handle_record_start,
    "record.stop": handle_record_stop,
    "record.active": handle_record_active,
    "integration.list": handle_integration_list,
    "integration.configure": handle_integration_configure,
    "integration.send": handle_integration_send,
    "integration.status": handle_integration_status,
}


async def dispatch_request(
    method: str,
    params: dict[str, Any],
    req_id: int | str | None,
    notify: NotifyFn | None = None,
) -> dict[str, Any]:
    handler = HANDLERS.get(method)
    if not handler:
        return _error(req_id, -32601, f"Method not found: {method}")
    try:
        result = await handler(params, notify)
        return {"jsonrpc": "2.0", "id": req_id, "result": result}
    except InterruptedError:
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "result": "Task cancelled by user.",
                "steps": [],
                "skill_created": None,
                "elapsed_secs": 0,
                "strategy_used": "cancelled",
            },
        }
    except Exception as e:
        logger.exception("handler_error", method=method)
        return _error(req_id, -32000, str(e))


def _error(req_id: int | str | None, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


# ── Connection Handler ─────────────────────────────────────────────

async def handle_connection(
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
) -> None:
    """Handle a single client connection (one or more JSON-RPC requests)."""
    notify: NotifyFn | None = None

    async def _notify(method: str, params: dict[str, Any]) -> None:
        try:
            msg = json.dumps({"jsonrpc": "2.0", "method": method, "params": params}) + "\n"
            writer.write(msg.encode())
            await writer.drain()
        except Exception:
            pass

    async def read_cancel() -> None:
        """Background task: read additional lines for cancel while agent.run is active."""
        try:
            while True:
                line = await reader.readline()
                if not line:
                    break
                try:
                    msg = json.loads(line.decode())
                    if msg.get("method") == "agent.cancel":
                        InterruptSignal.get().trigger("Cancelled by user")
                        break
                except json.JSONDecodeError:
                    pass
                except Exception:
                    pass
        except Exception:
            pass

    try:
        line = await reader.readline()
        if not line:
            return

        try:
            req = json.loads(line.decode())
        except json.JSONDecodeError:
            response = _error(None, -32700, "Parse error")
            writer.write((json.dumps(response) + "\n").encode())
            await writer.drain()
            return

        method = req.get("method", "")
        params = req.get("params", {})
        req_id = req.get("id")

        if method == "agent.run":
            # agent.run uses streaming — keep connection open,
            # read for cancel in background
            cancel_task = asyncio.create_task(read_cancel())
            try:
                response = await dispatch_request(method, params, req_id, _notify)
            finally:
                cancel_task.cancel()
                try:
                    await cancel_task
                except asyncio.CancelledError:
                    pass
        else:
            response = await dispatch_request(method, params, req_id, None)

        writer.write((json.dumps(response) + "\n").encode())
        await writer.drain()

    except Exception:
        logger.exception("connection_error")
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass


# ── Server ─────────────────────────────────────────────────────────

async def serve() -> None:
    """Start the Unix socket JSON-RPC server."""
    if os.path.exists(SOCKET):
        os.unlink(SOCKET)

    server = await asyncio.start_unix_server(handle_connection, path=SOCKET)
    logger.info("rpc_server_started", socket=SOCKET)

    async with server:
        await server.serve_forever()


def main() -> None:
    """Entry point: python -m sediman.rpc_server."""
    import sys

    provider = os.environ.get("SEDIMAN_PROVIDER", "openai")
    model = os.environ.get("SEDIMAN_MODEL")
    base_url = os.environ.get("SEDIMAN_BASE_URL") or os.environ.get("OLLAMA_BASE_URL")
    terminal = os.environ.get("SEDIMAN_TERMINAL", "").lower() in ("true", "1", "yes")

    init_state(provider=provider, model=model, base_url=base_url, terminal=terminal)

    from sediman.integrations import setup_integrations, start_listeners
    setup_integrations()

    try:
        asyncio.run(serve())
    except KeyboardInterrupt:
        logger.info("rpc_server_shutdown")
        asyncio.run(_shutdown())


if __name__ == "__main__":
    main()
