#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// Automatically read .env in the skill directory if present
const envFile = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf-8').split('\n');
  for (const line of lines) {
    const match = line.trim().match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

const command = process.argv.slice(2).join(' ');
if (!command) {
  console.error('Usage: node send_command.js "<command to execute>" [--raw] [--timeout <ms>]');
  process.exit(1);
}

const WS_URL = process.env.VSCODE_MONITOR_URL || 'ws://127.0.0.1:8090';
const TIMEOUT_MS = parseInt(process.env.COMMAND_TIMEOUT || '5000', 10);
const HEADERS = {};

if (process.env.CF_ACCESS_CLIENT_ID) {
  HEADERS['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
}
if (process.env.CF_ACCESS_CLIENT_SECRET) {
  HEADERS['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
}

const ws = new WebSocket(WS_URL, { headers: HEADERS });
let output = '';
let silenceTimer = null;

function resetSilenceTimer() {
  if (silenceTimer) clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    ws.close();
    process.exit(0);
  }, 1500); // Close 1.5s after last stdout activity
}

const maxTimer = setTimeout(() => {
  console.error(`\n[send_command] Command timed out after ${TIMEOUT_MS}ms.`);
  ws.close();
  process.exit(1);
}, TIMEOUT_MS);

ws.on('open', () => {
  // Discard rolling buffer or send immediately
  setTimeout(() => {
    const isRaw = process.argv.includes('--raw');
    ws.send(isRaw ? command : `${command}\n`);
    resetSilenceTimer();
  }, 200);
});

ws.on('message', (data) => {
  const text = data.toString();
  output += text;
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
