#!/usr/bin/env bash
# Starts the VS Code Monitor Bridge daemon
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

export PATH="/config/bin:$PATH"
export LD_LIBRARY_PATH="/config/lib:${LD_LIBRARY_PATH:-}"
export SHELL="${SHELL:-/bin/bash}"
if [ "$SHELL" = "/bin/false" ]; then export SHELL="/bin/bash"; fi

# Ensure native node-pty addon is built
PTY_NODE="$SCRIPT_DIR/node_modules/node-pty/build/Release/pty.node"
if [ ! -f "$PTY_NODE" ]; then
  echo "[Bridge] Native pty.node not found. Compiling node-pty addon..."
  if [ -d "$SCRIPT_DIR/node_modules/node-pty" ]; then
    (cd "$SCRIPT_DIR/node_modules/node-pty" && npx --yes node-gyp rebuild) || true
  else
    npm install
  fi
fi

echo "[Bridge] Starting VS Code Stdio Monitor Bridge..."
exec node src/server.js
