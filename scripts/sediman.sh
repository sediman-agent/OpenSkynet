#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON_SOCKET="${SEDIMAN_PYTHON_SOCKET:-/tmp/sediman-python.sock}"
TS_SOCKET="${SEDIMAN_SOCKET:-/tmp/sediman.sock}"

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $PY_PID $TS_PID 2>/dev/null || true
  wait $PY_PID $TS_PID 2>/dev/null || true
  rm -f "$PYTHON_SOCKET" "$TS_SOCKET" 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

# Start Python RPC server
echo "Starting Python RPC server..."
rm -f "$PYTHON_SOCKET"
cd "$ROOT" && uv run python -m sediman.rpc_server &
PY_PID=$!

# Wait for Python socket
for i in $(seq 1 15); do
  if [ -S "$PYTHON_SOCKET" ]; then
    echo "  Python RPC ready ($PYTHON_SOCKET)"
    break
  fi
  sleep 0.5
done
if [ ! -S "$PYTHON_SOCKET" ]; then
  echo "ERROR: Python RPC server did not start" >&2
  exit 1
fi

# Start TS RPC server
echo "Starting TS RPC server..."
rm -f "$TS_SOCKET"
cd "$ROOT/packages/server" && bun run rpc &
TS_PID=$!

# Wait for TS socket
for i in $(seq 1 15); do
  if [ -S "$TS_SOCKET" ]; then
    echo "  TS RPC ready ($TS_SOCKET)"
    break
  fi
  sleep 0.5
done
if [ ! -S "$TS_SOCKET" ]; then
  echo "ERROR: TS RPC server did not start" >&2
  exit 1
fi

echo ""
echo "Both servers ready. Starting TUI..."
echo ""

# Start TUI (foreground)
cd "$ROOT/packages/sediman-tui" && bun run start
