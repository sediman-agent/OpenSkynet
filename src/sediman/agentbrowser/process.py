from __future__ import annotations

import asyncio
import shutil
import signal
from pathlib import Path

import structlog

logger = structlog.get_logger()

_SOURCE_DIR = Path(__file__).resolve().parent.parent.parent.parent / "vendor" / "Openbrowser" / "ai-agent" / "open-browser"


class AgentBrowserProcess:
    def __init__(self, binary: str | None = None):
        self._binary = binary or self._find_binary()
        self._process: asyncio.subprocess.Process | None = None
        self._started = False

    @property
    def is_running(self) -> bool:
        return self._started and self._process is not None and self._process.returncode is None

    @staticmethod
    def _find_binary() -> str:
        for name in ("open-browser-agent", "open-browser-agent-bin"):
            path = shutil.which(name)
            if path:
                return path
        node_path = shutil.which("node")
        if node_path:
            sidecar = _SOURCE_DIR / "dist" / "sidecar.js"
            if sidecar.exists():
                return f"{node_path} {sidecar}"
        return "open-browser-agent"

    @staticmethod
    def is_available() -> bool:
        if shutil.which("open-browser-agent") or shutil.which("open-browser-agent-bin"):
            return True
        node_path = shutil.which("node")
        if node_path:
            sidecar = _SOURCE_DIR / "dist" / "sidecar.js"
            if sidecar.exists():
                return True
        return False

    @staticmethod
    async def build_from_source() -> bool:
        if not _SOURCE_DIR.exists():
            return False
        package_json = _SOURCE_DIR / "package.json"
        if not package_json.exists():
            return False
        try:
            node_modules = _SOURCE_DIR / "node_modules"
            if not node_modules.exists():
                proc = await asyncio.create_subprocess_exec(
                    "npm", "install",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=str(_SOURCE_DIR),
                )
                await asyncio.wait_for(proc.wait(), timeout=120)
                if proc.returncode != 0:
                    return False

            proc = await asyncio.create_subprocess_exec(
                "npm", "run", "build",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(_SOURCE_DIR),
            )
            await asyncio.wait_for(proc.wait(), timeout=60)
            if proc.returncode != 0:
                return False

            return (_SOURCE_DIR / "dist" / "sidecar.js").exists()
        except Exception as e:
            logger.warning("agent_browser_build_failed", error=str(e))
            return False

    async def start(self) -> None:
        if self._started:
            return

        binary = self._binary
        if not binary:
            raise FileNotFoundError(
                "open-browser-agent not found. "
                "Install it or ensure node + the vendor/Openbrowser/ai-agent source is available."
            )

        if " " in binary:
            parts = binary.split(" ", 1)
            cmd_name = parts[0]
            cmd_args = parts[1].split()
        else:
            cmd_name = binary
            cmd_args = []

        logger.info("agent_browser_starting", binary=cmd_name, args=cmd_args)

        self._process = await asyncio.create_subprocess_exec(
            cmd_name,
            *cmd_args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        ready = await self._wait_ready(max_wait=10.0)
        if not ready:
            await self.stop()
            raise RuntimeError("open-browser-agent failed to start within 10s")

        self._started = True
        logger.info("agent_browser_started")

    async def stop(self) -> None:
        if self._process and self._process.returncode is None:
            self._process.send_signal(signal.SIGTERM)
            try:
                await asyncio.wait_for(self._process.wait(), timeout=5.0)
            except TimeoutError:
                self._process.kill()
                await self._process.wait()
        self._process = None
        self._started = False
        logger.info("agent_browser_stopped")

    @property
    def stdin(self):
        return self._process.stdin if self._process else None

    @property
    def stdout(self):
        return self._process.stdout if self._process else None

    async def _wait_ready(self, max_wait: float = 10.0) -> bool:
        if not self._process or not self._process.stdout:
            return False

        deadline = asyncio.get_event_loop().time() + max_wait
        while asyncio.get_event_loop().time() < deadline:
            if self._process.returncode is not None:
                stderr = ""
                try:
                    raw = await asyncio.wait_for(self._process.stderr.read(), timeout=2.0)
                    stderr = raw.decode(errors="replace")[:500]
                except Exception:
                    logger.debug("stderr_read_failed")
                logger.error("agent_browser_exited", code=self._process.returncode, stderr=stderr)
                return False

            try:
                line = await asyncio.wait_for(self._process.stdout.readline(), timeout=1.0)
                if line:
                    text = line.decode(errors="replace").strip()
                    if text:
                        return True
            except asyncio.TimeoutError:
                continue
            except Exception:
                logger.debug("wait_ready_line_read_failed")
                return False

        return False
