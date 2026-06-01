from __future__ import annotations

import os

import structlog

logger = structlog.get_logger()

_initialized = False


def init_sentry() -> None:
    global _initialized
    if _initialized:
        return

    dsn = os.environ.get("SENTRY_DSN", "")
    if not dsn:
        return

    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=dsn,
            environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
            traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            profiles_sample_rate=float(os.environ.get("SENTRY_PROFILES_SAMPLE_RATE", "0.1")),
        )
        _initialized = True
        logger.info("sentry_initialized", environment=os.environ.get("SENTRY_ENVIRONMENT", "production"))
    except ImportError:
        logger.debug("sentry_sdk_not_installed")
    except Exception:
        logger.warning("sentry_init_failed")
