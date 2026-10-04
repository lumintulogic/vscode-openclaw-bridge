#!/usr/bin/env bash
# Helper script to start or ensure the target tmux session is alive
set -euo pipefail

SESSION_NAME="${1:-${TMUX_SESSION:-agent-session}}"
COMMAND="${2:-${CLI_COMMAND:-bash}}"

export PATH="/config/bin:$PATH"
export LD_LIBRARY_PATH="/config/lib:${LD_LIBRARY_PATH:-}"
export SHELL="${SHELL:-/bin/bash}"
if [ "$SHELL" = "/bin/false" ]; then export SHELL="/bin/bash"; fi

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "[tmux] Session '$SESSION_NAME' is already running."
else
  echo "[tmux] Creating new session '$SESSION_NAME' running '$COMMAND'..."
  tmux new-session -d -s "$SESSION_NAME" "$COMMAND"
  echo "[tmux] Session '$SESSION_NAME' created."
fi
