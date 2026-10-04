#!/usr/bin/env bash
# Starts the VS Code Monitor Bridge daemon
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

export PATH="/config/bin:$PATH"
export LD_LIBRARY_PATH="/config/lib:${LD_LIBRARY_PATH:-}"
export SHELL="${SHELL:-/bin/bash}"
if [ "$SHELL" = "/bin/false" ]; then export SHELL="/bin/bash"; fi

echo "[Bridge] Starting VS Code Stdio Monitor Bridge..."
exec node src/server.js
