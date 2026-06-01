"""GitHub API client wrapping the ``gh`` CLI."""

from __future__ import annotations

import json
import logging
import os
import subprocess
import time
from pathlib import Path
from typing import Any

from bot.config import Config
from bot.exceptions import GitHubAPIError

log = logging.getLogger("sediman-bot")


class GitHubClient:
    """Encapsulates all interaction with the GitHub API via the ``gh`` CLI."""

    def __init__(self, cfg: Config | None = None) -> None:
        self._cfg = cfg or Config()
        self._token: str | None = None

    # ------------------------------------------------------------------
    # Token handling
    # ------------------------------------------------------------------

    def _read_token(self) -> str:
        """Read the GitHub token, caching it for the process lifetime."""
        if self._token is None:
            self._token = Path(self._cfg.TOKEN_PATH).read_text().strip()
        return self._token

    def _base_env(self) -> dict[str, str]:
        """Return a clean environment with ``GH_TOKEN`` set."""
        env = os.environ.copy()
        env["GH_TOKEN"] = self._read_token()
        env["GH_CONFIG_DIR"] = "/tmp/gh-config-empty"
        return env

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def api(
        self,
        *args: str,
        required: bool = True,
        stdin_data: str | None = None,
    ) -> Any:
        """Call ``gh api`` with rate limiting.

        Parameters
        ----------
        *args:
            Arguments forwarded to ``gh api``.
        required:
            If *True* (default) a non-zero exit code raises
            :class:`GitHubAPIError`.  If *False* an empty dict is returned.
        stdin_data:
            Optional string piped to the subprocess's stdin.

        Returns
        -------
        dict | list
            Parsed JSON response.
        """
        env = self._base_env()
        cmd = ["gh", "api", *args]
        log.info("gh api %s...", " ".join(args[:3]))

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            env=env,
            timeout=60,
            input=stdin_data,
        )
        time.sleep(5)

        if result.returncode != 0:
            log.error("gh api error: %s", result.stderr)
            if required:
                raise GitHubAPIError(
                    f"gh api failed: {result.stderr}", stderr=result.stderr
                )
            return {}

        return json.loads(result.stdout)

    def cli(self, *args: str) -> str:
        """Call ``gh`` CLI with rate limiting.

        Parameters
        ----------
        *args:
            Arguments forwarded to ``gh``.

        Returns
        -------
        str
            Raw stdout output.
        """
        env = self._base_env()
        cmd = ["gh", *args]
        log.info("gh %s...", " ".join(args[:4]))

        result = subprocess.run(
            cmd, capture_output=True, text=True, env=env, timeout=120
        )
        time.sleep(5)

        if result.returncode != 0:
            log.error("gh error: %s", result.stderr)
            raise GitHubAPIError(
                f"gh failed: {result.stderr}", stderr=result.stderr
            )

        return result.stdout

    def api_with_stdin(self, *args: str, payload: str, required: bool = True) -> Any:
        """Convenience wrapper that pipes *payload* as stdin to ``gh api``.

        Parameters
        ----------
        *args:
            Arguments forwarded to ``gh api``.
        payload:
            JSON string piped to stdin.
        required:
            Whether a non-zero exit raises an error.

        Returns
        -------
        dict | list
            Parsed JSON response.
        """
        return self.api(*args, required=required, stdin_data=payload)
