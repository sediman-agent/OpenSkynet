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
SLACK_BOT_TOKEN_ENV = "SLACK_BOT_TOKEN"
SLACK_SIGNING_SECRET_ENV = "SLACK_SIGNING_SECRET"
SLACK_APP_LEVEL_TOKEN_ENV = "SLACK_APP_LEVEL_TOKEN"
WHATSAPP_ACCESS_TOKEN_ENV = "WHATSAPP_ACCESS_TOKEN"
WHATSAPP_PHONE_NUMBER_ID_ENV = "WHATSAPP_PHONE_NUMBER_ID"
WHATSAPP_VERIFY_TOKEN_ENV = "WHATSAPP_VERIFY_TOKEN"
WHATSAPP_WEBHOOK_URL_ENV = "WHATSAPP_WEBHOOK_URL"
LARK_APP_ID_ENV = "LARK_APP_ID"
LARK_APP_SECRET_ENV = "LARK_APP_SECRET"
LARK_VERIFY_TOKEN_ENV = "LARK_VERIFY_TOKEN"
LARK_ENCRYPT_KEY_ENV = "LARK_ENCRYPT_KEY"
LARK_WEBHOOK_URL_ENV = "LARK_WEBHOOK_URL"
WECHAT_ACCOUNT_ID_ENV = "WECHAT_ACCOUNT_ID"
WECHAT_TOKEN_ENV = "WECHAT_TOKEN"
WECHAT_BASE_URL_ENV = "WECHAT_BASE_URL"


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
            # Advanced config
            "dm_policy": "open",  # "open" | "allowlist" | "disabled"
            "group_policy": "open",  # "open" | "allowlist" | "disabled"
            "allow_from": [],  # List of allowed user IDs (for allowlist mode)
            "group_allow_from": [],  # List of allowed server IDs (for allowlist mode)
        },
        "telegram": {
            "enabled": False,
            "token": os.environ.get(TELEGRAM_BOT_TOKEN_ENV, ""),
            "chats": {},
            "whitelist": {
                "enabled": False,
                "users": [],
            },
            # Advanced config
            "dm_policy": "open",
            "group_policy": "open",
            "allow_from": [],
            "group_allow_from": [],
        },
        "slack": {
            "enabled": False,
            "token": os.environ.get(SLACK_BOT_TOKEN_ENV, ""),
            "signing_secret": os.environ.get(SLACK_SIGNING_SECRET_ENV, ""),
            "app_level_token": os.environ.get(SLACK_APP_LEVEL_TOKEN_ENV, ""),
            "channels": {},
            "whitelist": {
                "enabled": False,
                "users": [],
                "teams": [],
            },
            # Advanced config
            "dm_policy": "open",
            "group_policy": "open",
            "allow_from": [],
            "group_allow_from": [],
            "reply_broadcast": False,  # Broadcast thread replies to main channel
            "reply_in_thread": True,  # Reply in threads when possible
        },
        "whatsapp": {
            "enabled": False,
            "token": os.environ.get(WHATSAPP_ACCESS_TOKEN_ENV, ""),
            "phone_id": os.environ.get(WHATSAPP_PHONE_NUMBER_ID_ENV, ""),
            "verify_token": os.environ.get(WHATSAPP_VERIFY_TOKEN_ENV, ""),
            "webhook_url": os.environ.get(WHATSAPP_WEBHOOK_URL_ENV, ""),
            "contacts": {},
            "whitelist": {
                "enabled": False,
                "users": [],
            },
            # Advanced config
            "dm_policy": "open",
            "group_policy": "disabled",  # WhatsApp groups not supported by bot API
            "allow_from": [],
        },
        "lark": {
            "enabled": False,
            "app_id": os.environ.get(LARK_APP_ID_ENV, ""),
            "app_secret": os.environ.get(LARK_APP_SECRET_ENV, ""),
            "verify_token": os.environ.get(LARK_VERIFY_TOKEN_ENV, ""),
            "encrypt_key": os.environ.get(LARK_ENCRYPT_KEY_ENV, ""),
            "webhook_url": os.environ.get(LARK_WEBHOOK_URL_ENV, ""),
            "chats": {},
            "whitelist": {
                "enabled": False,
                "users": [],
            },
            # Advanced config
            "dm_policy": "open",
            "group_policy": "open",
            "allow_from": [],
            "group_allow_from": [],
            "user_id_type": "open_id",  # "open_id" | "user_id" | "union_id"
        },
        "wechat": {
            "enabled": False,
            "account_id": os.environ.get(WECHAT_ACCOUNT_ID_ENV, ""),
            "token": os.environ.get(WECHAT_TOKEN_ENV, ""),
            "base_url": os.environ.get(WECHAT_BASE_URL_ENV, "https://ilinkai.weixin.qq.com"),
            "contacts": {},
            "whitelist": {
                "enabled": False,
                "users": [],
            },
            # Advanced config
            "dm_policy": "open",
            "group_policy": "open",
            "allow_from": [],
            "group_allow_from": [],
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
                    # Handle token/app_id fallback for each platform
                    if not default[key].get("token") and not default[key].get("app_id"):
                        if key == "discord":
                            default[key]["token"] = os.environ.get(DISCORD_BOT_TOKEN_ENV, "")
                        elif key == "telegram":
                            default[key]["token"] = os.environ.get(TELEGRAM_BOT_TOKEN_ENV, "")
                        elif key == "slack":
                            default[key]["token"] = os.environ.get(SLACK_BOT_TOKEN_ENV, "")
                        elif key == "whatsapp":
                            default[key]["token"] = os.environ.get(WHATSAPP_ACCESS_TOKEN_ENV, "")
                        elif key == "lark":
                            default[key]["app_id"] = os.environ.get(LARK_APP_ID_ENV, "")
                            default[key]["app_secret"] = os.environ.get(LARK_APP_SECRET_ENV, "")
                        elif key == "wechat":
                            default[key]["account_id"] = os.environ.get(WECHAT_ACCOUNT_ID_ENV, "")
                            default[key]["token"] = os.environ.get(WECHAT_TOKEN_ENV, "")
                    # Ensure whitelist field exists
                    if "whitelist" not in default[key]:
                        if key == "discord":
                            default[key]["whitelist"] = {"enabled": False, "users": [], "servers": []}
                        elif key == "slack":
                            default[key]["whitelist"] = {"enabled": False, "users": [], "teams": []}
                        elif key == "whatsapp":
                            default[key]["whitelist"] = {"enabled": False, "users": []}
                        elif key == "lark":
                            default[key]["whitelist"] = {"enabled": False, "users": []}
                        elif key == "wechat":
                            default[key]["whitelist"] = {"enabled": False, "users": []}
                        else:
                            default[key]["whitelist"] = {"enabled": False, "users": []}
                    else:
                        # Ensure all whitelist keys exist
                        if "users" not in default[key]["whitelist"]:
                            default[key]["whitelist"]["users"] = []
                        if key == "discord" and "servers" not in default[key]["whitelist"]:
                            default[key]["whitelist"]["servers"] = []
                        if key == "slack" and "teams" not in default[key]["whitelist"]:
                            default[key]["whitelist"]["teams"] = []
            return default
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("integrations_config_load_failed", error=str(e))
    return _default_config()


def save_config(config: dict[str, Any]) -> None:
    INTEGRATIONS_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    INTEGRATIONS_CONFIG_PATH.write_text(json.dumps(config, indent=2))
    INTEGRATIONS_CONFIG_PATH.chmod(0o600)
