#!/usr/bin/env bash
set -euo pipefail

pkill -f 'sediman.rpc_server' 2>/dev/null || true
pkill -f 'sediman-tui' 2>/dev/null || true
sleep 0.3
rm -f /tmp/sediman-python.sock /tmp/sediman.sock

if [ "${1:-}" = "--release" ]; then
    exec ./target/release/sediman-tui "${@:2}"
else
    exec ./target/debug/sediman-tui "$@"
fi
