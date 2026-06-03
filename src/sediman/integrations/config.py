from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import structlog

from sediman.config import INTEGRATIONS_CONFIG_PATH

logger = structlog.get_logger()

DISCORD_BOT_TOKEN_ENV = "DISCORD_BOT_TOKEN"
TELEGRAM_BOT_TOKEN_ENV = "TELEGRAM_BOT_TOKEN"


def _default_config() -> dict[str, Any]:
    return {
        "discord": {
            "enabled": False,
            "token": os.environ.get(DISCORD_BOT_TOKEN_ENV, ""),
            "channels": {},
            "whitelist": {
                "enabled": False,
                "users": [],
                "servers": [],
            },
        },
        "telegram": {
            "enabled": False,
            "token": os.environ.get(TELEGRAM_BOT_TOKEN_ENV, ""),
            "chats": {},
            "whitelist": {
                "enabled": False,
                "users": [],
            },
        },
    }


def load_config() -> dict[str, Any]:
    if INTEGRATIONS_CONFIG_PATH.exists():
        try:
            user_config = json.loads(INTEGRATIONS_CONFIG_PATH.read_text())
            default = _default_config()
            for key in default:
                if key in user_config:
                    default[key].update(user_config[key])
                    if not default[key].get("token"):
                        env_key = (
                            DISCORD_BOT_TOKEN_ENV if key == "discord" else TELEGRAM_BOT_TOKEN_ENV
                        )
                        default[key]["token"] = os.environ.get(env_key, "")
                    # Ensure whitelist field exists
                    if "whitelist" not in default[key]:
                        default[key]["whitelist"] = {
                            "enabled": False,
                            "users": [],
                            "servers": [] if key == "discord" else [],
                        }
                    else:
                        # Ensure all whitelist keys exist
                        if "users" not in default[key]["whitelist"]:
                            default[key]["whitelist"]["users"] = []
                        if key == "discord" and "servers" not in default[key]["whitelist"]:
                            default[key]["whitelist"]["servers"] = []
            return default
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("integrations_config_load_failed", error=str(e))
    return _default_config()


def save_config(config: dict[str, Any]) -> None:
    INTEGRATIONS_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    INTEGRATIONS_CONFIG_PATH.write_text(json.dumps(config, indent=2))
    INTEGRATIONS_CONFIG_PATH.chmod(0o600)
