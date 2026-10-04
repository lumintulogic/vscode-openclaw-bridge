#!/usr/bin/env bash
# Automated skill installer for OpenClaw
set -euo pipefail

SKILL_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../skill" && pwd)"
TARGET_DIR="${1:-$HOME/.openclaw/skills/vscode-stdio-monitor}"

echo "[*] Installing vscode-stdio-monitor skill to: $TARGET_DIR"
mkdir -p "$TARGET_DIR"
cp -r "$SKILL_SRC"/* "$TARGET_DIR/"
chmod +x "$TARGET_DIR"/scripts/*.js 2>/dev/null || true

# Ensure ws dependency is available in the target dir
if [ ! -d "$TARGET_DIR/node_modules" ]; then
  echo "[*] Installing required Node modules..."
  cd "$TARGET_DIR"
  npm init -y --silent 2>/dev/null || true
  npm install --silent ws 2>/dev/null || true
fi

echo "[✓] Skill successfully installed!"
echo "    Location: $TARGET_DIR"
echo "    Bridge endpoint default: ws://127.0.0.1:8090"
