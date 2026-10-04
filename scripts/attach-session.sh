#!/usr/bin/env bash
# Helper script to attach to the agent tmux session from any terminal
set -euo pipefail

SESSION_NAME="${1:-${TMUX_SESSION:-agent-session}}"

export PATH="/config/bin:$PATH"
export LD_LIBRARY_PATH="/config/lib:${LD_LIBRARY_PATH:-}"
export SHELL="${SHELL:-/bin/bash}"
if [ "$SHELL" = "/bin/false" ]; then export SHELL="/bin/bash"; fi

if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "[!] Session '$SESSION_NAME' does not exist yet. Creating it..."
  tmux new-session -d -s "$SESSION_NAME" bash
fi

echo "[*] Attaching to tmux session '$SESSION_NAME'..."
echo "[*] (Press Ctrl+B then D to detach without closing the session)"
tmux attach-session -t "$SESSION_NAME"
