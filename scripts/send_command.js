#!/usr/bin/env node
/**
 * Command runner for vscode-stdio-monitor skill in OpenClaw.
 * Sends stdin input and captures live stdout from the VS Code bridge tmux session.
 */
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// Look for .env in current dir, parent dir, or skill root
const potentialEnvPaths = [
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'skill', '.env'),
];

for (const envFile of potentialEnvPaths) {
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.trim().match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
    break;
  }
}

const args = process.argv.slice(2);
const isRaw = args.includes('--raw');
const filteredArgs = args.filter((a, idx) => {
  if (a === '--raw') return false;
  if (a === '--timeout' || (idx > 0 && args[idx - 1] === '--timeout')) return false;
  return true;
});

const command = filteredArgs.join(' ');
if (!command) {
  console.error('Usage: node scripts/send_command.js "<command to execute>" [--raw] [--timeout <ms>]');
  process.exit(1);
}

let timeoutMs = 5000;
const timeoutIndex = args.indexOf('--timeout');
if (timeoutIndex !== -1 && args[timeoutIndex + 1]) {
  timeoutMs = parseInt(args[timeoutIndex + 1], 10);
} else if (process.env.COMMAND_TIMEOUT) {
  timeoutMs = parseInt(process.env.COMMAND_TIMEOUT, 10);
}

const WS_URL = process.env.VSCODE_MONITOR_URL || 'ws://127.0.0.1:8090';
const HEADERS = {};

if (process.env.CF_ACCESS_CLIENT_ID) {
  HEADERS['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
}
if (process.env.CF_ACCESS_CLIENT_SECRET) {
  HEADERS['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
}

const ws = new WebSocket(WS_URL, { headers: HEADERS });
let silenceTimer = null;

function resetSilenceTimer() {
  if (silenceTimer) clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    ws.close();
    process.exit(0);
  }, 1500); // Close 1.5s after last stdout activity
}

const maxTimer = setTimeout(() => {
  console.error(`\n[send_command] Command timed out after ${timeoutMs}ms.`);
  ws.close();
  process.exit(1);
}, timeoutMs);

ws.on('open', () => {
  // Discard rolling buffer or send immediately
  setTimeout(() => {
    ws.send(isRaw ? command : `${command}\n`);
    resetSilenceTimer();
  }, 200);
});

ws.on('message', (data) => {
  const text = data.toString();
  process.stdout.write(text);
  resetSilenceTimer();
});

ws.on('error', (err) => {
  console.error('[send_command] Error:', err.message);
  clearTimeout(maxTimer);
  process.exit(1);
});

ws.on('close', () => {
  clearTimeout(maxTimer);
  if (silenceTimer) clearTimeout(silenceTimer);
});
