# Sediman Bot

Autonomous issue scanner and PR solver for the OpenSkynet project.

## What it does

1. **Scan** — Pre-scans the codebase for high-risk, untested files, then uses
   opencode to find 2-4 real bugs and files them as GitHub issues.
2. **Solve** — Picks up the first open issue, asks opencode to produce a minimal
   fix, runs local CI, and opens a PR from the fork.

## Quick start

```bash
# Scan only
python -m bot.main scan

# Solve the last-scanned issues
python -m bot.main solve

# Full cycle (scan then solve)
python -m bot.main both
```

All commands must be run from the **repository root** (e.g. `/root/sediman-browse`)
or wherever `BOT_WORKDIR` points.

## Configuration

Every setting can be overridden via an environment variable:

| Setting       | Env var           | Default                                        |
|---------------|-------------------|------------------------------------------------|
| REPO          | `BOT_REPO`        | `sediman-agent/OpenSkynet`                     |
| FORK          | `BOT_FORK`        | `JasonSedimanBOT/sediman-agent`                |
| WORKDIR       | `BOT_WORKDIR`     | `/root/sediman-browse`                         |
| TOKEN_PATH    | `BOT_TOKEN_PATH`  | `/root/.config/sediman-bot/gh-token`           |
| LOG_DIR       | `BOT_LOG_DIR`     | `/var/log/sediman-bot`                         |
| BRANCH_PREFIX | `BOT_BRANCH_PREFIX` | `bot/fix`                                    |

## Cron schedule

A 90-minute cycle is recommended:

```cron
*/90 * * * * cd /root/sediman-browse && python -m bot.main both >> /var/log/sediman-bot/cron.log 2>&1
```

## Safety

- 5-second sleep between every GitHub API call (rate limiting).
- Local CI **must** pass before any PR is pushed.
- Issue deduplication against all existing open and closed issues.
- PRs are **never** auto-merged.
