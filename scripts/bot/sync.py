"""Repository synchronisation — keeps the working tree on latest ``origin/main``."""

from __future__ import annotations

import logging
import subprocess
import time

log = logging.getLogger("sediman-bot")


def sync_repo(workdir: str) -> None:
    """Reset the local clone to the latest ``origin/main``.

    Stashes any local changes, checks out ``main``, hard-resets to
    ``origin/main``, and removes untracked files.

    Parameters
    ----------
    workdir:
        Path to the git repository root.
    """
    log.info("Syncing repo to latest...")
    subprocess.run(["git", "stash"], cwd=workdir, capture_output=True)
    subprocess.run(["git", "checkout", "main"], cwd=workdir, capture_output=True)
    subprocess.run(["git", "fetch", "--all"], cwd=workdir, capture_output=True)
    subprocess.run(["git", "reset", "--hard", "origin/main"], cwd=workdir, capture_output=True)
    subprocess.run(["git", "clean", "-fd"], cwd=workdir, capture_output=True)
    log.info("Repo synced to latest origin/main")
    time.sleep(2)
