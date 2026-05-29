from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import structlog

logger = structlog.get_logger()

INTEGRATIONS_CONFIG_PATH = Path.home() / ".sediman" / "integrations.json"

DISCORD_BOT_TOKEN_ENV = "DISCORD_BOT_TOKEN"
TELEGRAM_BOT_TOKEN_ENV = "TELEGRAM_BOT_TOKEN"


def _default_config() -> dict[str, Any]:
    return {
        "discord": {
            "enabled": False,
            "token": os.environ.get(DISCORD_BOT_TOKEN_ENV, ""),
            "channels": {},
        },
        "telegram": {
            "enabled": False,
            "token": os.environ.get(TELEGRAM_BOT_TOKEN_ENV, ""),
            "chats": {},
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
            return default
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("integrations_config_load_failed", error=str(e))
    return _default_config()


def save_config(config: dict[str, Any]) -> None:
    INTEGRATIONS_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    INTEGRATIONS_CONFIG_PATH.write_text(json.dumps(config, indent=2))
