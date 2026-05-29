from __future__ import annotations

import asyncio
from typing import Any

import structlog

from sediman.integrations.base import Integration
from sediman.integrations.config import load_config, save_config
from sediman.integrations.models import Channel, Message

logger = structlog.get_logger()

_registry: dict[str, Integration] = {}
_listener_tasks: list[asyncio.Task] = []


def get_integration(name: str) -> Integration | None:
    return _registry.get(name)


def list_integrations() -> dict[str, dict[str, Any]]:
    config = load_config()
    result = {}
    for name, cfg in config.items():
        inst = _registry.get(name)
        result[name] = {
            "enabled": cfg.get("enabled", False),
            "configured": bool(cfg.get("token")),
            "channels": cfg.get("channels", {}),
            "chats": cfg.get("chats", {}),
            "connected": inst is not None and inst.enabled,
        }
    return result


def get_config() -> dict[str, Any]:
    return load_config()


def update_config(name: str, updates: dict[str, Any]) -> dict[str, Any]:
    config = load_config()
    if name not in config:
        raise ValueError(f"Unknown integration: {name}")
    for key, value in updates.items():
        if value is not None:
            if key == "channels" or key == "chats":
                config[name].setdefault(key, {}).update(value)
            else:
                config[name][key] = value
    save_config(config)
    _reload_integration(name, config[name])
    return config[name]


def _reload_integration(name: str, cfg: dict[str, Any]) -> None:
    global _registry
    old = _registry.pop(name, None)
    if cfg.get("enabled") and cfg.get("token"):
        inst = _build_integration(name, cfg)
        if inst:
            _registry[name] = inst


def _build_integration(name: str, cfg: dict[str, Any]) -> Integration | None:
    if name == "discord":
        from sediman.integrations.discord import DiscordIntegration
        return DiscordIntegration(cfg)
    elif name == "telegram":
        from sediman.integrations.telegram import TelegramIntegration
        return TelegramIntegration(cfg)
    logger.warning("unknown_integration", name=name)
    return None


def setup_integrations() -> None:
    config = load_config()
    for name, cfg in config.items():
        if cfg.get("enabled") and cfg.get("token"):
            inst = _build_integration(name, cfg)
            if inst:
                _registry[name] = inst
                logger.info("integration_enabled", name=name)


def setup_integration_tools() -> list[tuple[Any, Any]]:
    tools = []
    for name, inst in _registry.items():
        for tool_def, handler in inst.get_tools():
            tools.append((tool_def, handler))
    return tools


def get_all_tools() -> list[tuple[Any, Any]]:
    return setup_integration_tools()


async def start_listeners() -> None:
    global _listener_tasks
    for name, inst in _registry.items():
        task = asyncio.create_task(inst.listen(), name=f"integration-{name}")
        _listener_tasks.append(task)
        logger.info("integration_listener_started", name=name)


async def stop_listeners() -> None:
    global _listener_tasks
    for task in _listener_tasks:
        task.cancel()
    if _listener_tasks:
        await asyncio.gather(*_listener_tasks, return_exceptions=True)
    _listener_tasks = []


async def send_message(
    integration: str,
    target: str,
    content: str,
    **kwargs: Any,
) -> str:
    inst = get_integration(integration)
    if not inst:
        raise ValueError(f"Integration '{integration}' is not enabled")
    return await inst.send(target, content, **kwargs)


async def read_messages(
    integration: str,
    target: str,
    limit: int = 10,
) -> list[dict[str, Any]]:
    inst = get_integration(integration)
    if not inst:
        raise ValueError(f"Integration '{integration}' is not enabled")
    results = await inst.read(target, limit=limit)
    return [m if isinstance(m, dict) else {"id": m.id, "text": m.text, "author": m.author, "channel": m.channel, "timestamp": m.timestamp} for m in results]
