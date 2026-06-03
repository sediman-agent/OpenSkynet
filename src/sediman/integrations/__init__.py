from __future__ import annotations

import asyncio
from typing import Any, TYPE_CHECKING

import structlog

from sediman.integrations.base import Integration
from sediman.integrations.config import load_config, save_config
from sediman.integrations.models import Channel, Message

if TYPE_CHECKING:
    from sediman.gateway.runner import GatewayRunner

logger = structlog.get_logger()

_registry: dict[str, Integration] = {}
_listener_tasks: list[asyncio.Task] = []
_gateway_runner: GatewayRunner | None = None
_gateway_config: dict[str, Any] = {}


def get_integration(name: str) -> Integration | None:
    return _registry.get(name)


def set_gateway_runner(runner: Any) -> None:
    """Set the GatewayRunner instance for integration message handling."""
    global _gateway_runner
    _gateway_runner = runner


def get_gateway_runner() -> Any:
    """Get the GatewayRunner instance."""
    return _gateway_runner


def set_gateway_config(config: dict[str, Any]) -> None:
    """Set configuration for the Gateway system."""
    global _gateway_config
    _gateway_config = config


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


async def _close_integration(inst: Integration) -> None:
    try:
        await inst.close()
    except Exception:
        logger.debug("silent_error", _line=59)


def _reload_integration(name: str, cfg: dict[str, Any]) -> None:
    global _registry
    old = _registry.pop(name, None)
    if old:
        import asyncio
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_close_integration(old))
        except RuntimeError:
            asyncio.run(_close_integration(old))
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
    elif name == "slack":
        from sediman.integrations.slack import SlackIntegration
        return SlackIntegration(cfg)
    elif name == "whatsapp":
        from sediman.integrations.whatsapp import WhatsAppIntegration
        return WhatsAppIntegration(cfg)
    elif name == "lark":
        from sediman.integrations.lark import LarkIntegration
        return LarkIntegration(cfg)
    elif name == "wechat":
        from sediman.integrations.wechat import WeChatIntegration
        return WeChatIntegration(cfg)
    logger.warning("unknown_integration", name=name)
    return None


def setup_integrations() -> None:
    """Initialize all enabled integrations and register their adapters with GatewayRunner."""
    config = load_config()
    for name, cfg in config.items():
        # Check if integration is enabled and has credentials
        # Lark uses app_id/app_secret, WeChat uses account_id, others use token
        has_credentials = cfg.get("token") or cfg.get("app_id") or cfg.get("account_id")
        if cfg.get("enabled") and has_credentials:
            inst = _build_integration(name, cfg)
            if inst:
                _registry[name] = inst
                logger.info("integration_enabled", name=name)

                # Register adapter with GatewayRunner if available
                if _gateway_runner and hasattr(inst, 'get_adapter'):
                    adapter = inst.get_adapter()
                    if adapter:
                        # Set up whitelist for this platform
                        platform_whitelist = cfg.get("whitelist", {})
                        if platform_whitelist.get("enabled", False):
                            allowed_users = set(platform_whitelist.get("users", []))
                            _gateway_runner.set_allowed_users(name, allowed_users)
                            logger.info(
                                "integration_whitelist_enabled",
                                name=name,
                                users=len(allowed_users)
                            )

                            # For Discord, also set server whitelist
                            if name == "discord":
                                allowed_servers = set(platform_whitelist.get("servers", []))
                                if allowed_servers:
                                    _gateway_runner.set_allowed_servers(name, allowed_servers)
                                    logger.info(
                                        "integration_server_whitelist_enabled",
                                        name=name,
                                        servers=len(allowed_servers)
                                    )

                            # For Slack, also set team whitelist
                            if name == "slack":
                                allowed_teams = set(platform_whitelist.get("teams", []))
                                if allowed_teams:
                                    _gateway_runner.set_allowed_servers(name, allowed_teams)
                                    logger.info(
                                        "integration_team_whitelist_enabled",
                                        name=name,
                                        teams=len(allowed_teams)
                                    )

                        # Register adapter
                        _gateway_runner.register_adapter(adapter)
                        logger.info("integration_adapter_registered", name=name)


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
    for name, inst in list(_registry.items()):
        try:
            await inst.close()
        except Exception:
            logger.debug("silent_error", _line=130)


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
