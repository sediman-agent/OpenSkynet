"""Configuration for the Sediman autonomous bot."""

from dataclasses import dataclass, field
import os


@dataclass(frozen=True)
class Config:
    """Immutable configuration loaded from environment variables with sensible defaults."""

    REPO: str = field(
        default_factory=lambda: os.getenv("BOT_REPO", "sediman-agent/OpenSkynet")
    )
    FORK: str = field(
        default_factory=lambda: os.getenv("BOT_FORK", "JasonSedimanBOT/sediman-agent")
    )
    WORKDIR: str = field(
        default_factory=lambda: os.getenv("BOT_WORKDIR", "/root/sediman-browse")
    )
    TOKEN_PATH: str = field(
        default_factory=lambda: os.getenv(
            "BOT_TOKEN_PATH", "/root/.config/sediman-bot/gh-token"
        )
    )
    LOG_DIR: str = field(
        default_factory=lambda: os.getenv("BOT_LOG_DIR", "/var/log/sediman-bot")
    )
    BRANCH_PREFIX: str = field(
        default_factory=lambda: os.getenv("BOT_BRANCH_PREFIX", "bot/fix")
    )
