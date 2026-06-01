"""CLI entry point for the Sediman autonomous bot."""

from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from bot.config import Config
from bot.github_client import GitHubClient
from bot.scanner import IssueScanner
from bot.solver import PRSolver
from bot.sync import sync_repo


def _build_parser() -> argparse.ArgumentParser:
    """Return the argument parser with scan / solve / both subcommands."""
    parser = argparse.ArgumentParser(
        prog="bot.main",
        description="Sediman autonomous issue scanner and PR solver",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("scan", help="Scan codebase and file issues")
    sub.add_parser("solve", help="Solve previously filed issues")
    sub.add_parser("both", help="Run scan then solve in one cycle")

    return parser


def _setup_logging(log_dir: str) -> None:
    """Configure root ``sediman-bot`` logger with console + rotating file handler."""
    os.makedirs(log_dir, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler(
                f"{log_dir}/cycle-{datetime.now():%Y%m%d-%H%M%S}.log"
            ),
        ],
    )


def main(argv: list[str] | None = None) -> None:
    """Entry point — parse args, run the requested phase, and exit."""
    args = _build_parser().parse_args(argv)
    command: str = args.command

    cfg = Config()
    _setup_logging(cfg.LOG_DIR)
    log = logging.getLogger("sediman-bot")

    log.info("Sediman Bot starting — phase=%s", command)

    gh = GitHubClient(cfg)
    scanner = IssueScanner(gh, cfg)
    solver = PRSolver(gh, cfg)

    try:
        if command in ("scan", "both"):
            sync_repo(cfg.WORKDIR)
            issues = scanner.scan()
            log.info("Phase 1 complete: %d issues filed", len(issues))
            Path("/tmp/sediman-last-issues.json").write_text(json.dumps(issues))

        if command in ("solve", "both"):
            if command == "solve":
                issues = json.loads(
                    Path("/tmp/sediman-last-issues.json").read_text()
                )
            else:
                issues = json.loads(
                    Path("/tmp/sediman-last-issues.json").read_text()
                )
            success = solver.solve(issues)
            log.info("Phase 2 complete: PR %s", "created" if success else "skipped")

    except Exception as exc:
        log.error("Cycle failed: %s", exc, exc_info=True)
        subprocess.run(
            ["git", "checkout", "main"], cwd=cfg.WORKDIR, capture_output=True
        )
        sys.exit(1)

    log.info("Sediman Bot cycle complete")


if __name__ == "__main__":
    main()
