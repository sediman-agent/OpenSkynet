from __future__ import annotations

import logging
from contextlib import contextmanager

SUPPRESSED_LOGGERS = [
    "browser_use",
    "Agent",
    "tools",
    "BrowserSession",
    "service",
    "httpx",
    "httpcore",
    "openai._base_client",
    "asyncio",
    "browser_use.agent",
    "browser_use.browser",
    "browser_use.tools",
    "browser_use.controller",
    "bubus",
]

_db_initialized = False


def suppress_noisy_loggers() -> None:
    for name in SUPPRESSED_LOGGERS:
        logger = logging.getLogger(name)
        logger.setLevel(logging.CRITICAL)
        logger.propagate = False


async def ensure_db() -> None:
    global _db_initialized
    if _db_initialized:
        return
    from sediman.store.db import init_db
    await init_db()
    _db_initialized = True


@contextmanager
def suppress_all_logging():
    old_level = logging.getLogger().level
    logging.getLogger().setLevel(logging.CRITICAL)
    try:
        yield
    finally:
        logging.getLogger().setLevel(old_level)
