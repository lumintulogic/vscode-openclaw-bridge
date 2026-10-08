#!/usr/bin/env bash
# Automated skill installer for OpenClaw
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-$HOME/.openclaw/skills/vscode-stdio-monitor}"

echo "[*] Installing vscode-stdio-monitor skill to: $TARGET_DIR"
mkdir -p "$TARGET_DIR"

# Copy root skill files and scripts
cp "$REPO_ROOT/SKILL.md" "$TARGET_DIR/"
cp "$REPO_ROOT/skill.json" "$TARGET_DIR/" 2>/dev/null || true
cp "$REPO_ROOT/clawhub.json" "$TARGET_DIR/" 2>/dev/null || true
cp "$REPO_ROOT/package.json" "$TARGET_DIR/" 2>/dev/null || true

mkdir -p "$TARGET_DIR/scripts"
cp -r "$REPO_ROOT/scripts"/* "$TARGET_DIR/scripts/"
chmod +x "$TARGET_DIR"/scripts/*.js "$TARGET_DIR"/scripts/*.sh 2>/dev/null || true

# Copy .env template or existing .env if present
if [ -f "$REPO_ROOT/.env" ] && [ ! -f "$TARGET_DIR/.env" ]; then
  cp "$REPO_ROOT/.env" "$TARGET_DIR/.env"
fi

# Ensure ws dependency is available in the target dir
if [ ! -d "$TARGET_DIR/node_modules" ]; then
  echo "[*] Installing required Node dependencies in skill directory..."
  cd "$TARGET_DIR"
  npm install --silent --omit=dev 2>/dev/null || npm install --silent ws 2>/dev/null || true
fi

echo "[✓] Skill successfully installed!"
echo "    Location: $TARGET_DIR"
echo "    Ready to be used by OpenClaw agents in chat."
