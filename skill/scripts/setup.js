#!/usr/bin/env node
/**
 * Setup and verification script for vscode-stdio-monitor skill in OpenClaw.
 * Saves configuration to .env and verifies connectivity through Cloudflare Access.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// Parse CLI arguments
const args = process.argv.slice(2);
const params = {};

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].replace(/^--/, '');
    const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
    params[key] = val;
  }
}

const rawHost = params.host || params.url || process.env.VSCODE_HOST;
const clientId = params['client-id'] || params.clientId || process.env.CF_ACCESS_CLIENT_ID || '';
const clientSecret = params['client-secret'] || params.clientSecret || process.env.CF_ACCESS_CLIENT_SECRET || '';

if (!rawHost) {
  console.error(JSON.stringify({
    success: false,
    error: 'Missing host/url. Usage: node setup.js --host <https://vscode.domain.tld> [--client-id <id>] [--client-secret <secret>]'
  }));
  process.exit(1);
}

// Clean and normalize URLs
let baseDomain = rawHost.trim().replace(/\/+$/, '');
if (!baseDomain.startsWith('http://') && !baseDomain.startsWith('https://')) {
  baseDomain = `https://${baseDomain}`;
}

// Ensure /proxy/8090 is appended if not already present
let httpBaseUrl = baseDomain;
if (!httpBaseUrl.includes('/proxy/8090')) {
  httpBaseUrl = `${httpBaseUrl}/proxy/8090`;
}

// Derive WebSocket URL
const wsBaseUrl = httpBaseUrl.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://') + '/';

const skillDir = path.resolve(__dirname, '..');
const envPath = path.join(skillDir, '.env');

// Construct .env content
const envContent = `# VS Code Stdio Monitor Skill Configuration
VSCODE_HTTP_URL=${httpBaseUrl}
VSCODE_MONITOR_URL=${wsBaseUrl}
CF_ACCESS_CLIENT_ID=${clientId}
CF_ACCESS_CLIENT_SECRET=${clientSecret}
`;

fs.writeFileSync(envPath, envContent, 'utf-8');

console.log(`[*] Configuration saved to ${envPath}`);
console.log(`[*] Verifying connectivity against ${httpBaseUrl}/health ...`);

// Health check request
const healthUrl = new URL(`${httpBaseUrl}/health`);
const isHttps = healthUrl.protocol === 'https:';
const clientLib = isHttps ? https : http;

const headers = {
  'User-Agent': 'OpenClaw-Skill-Setup/1.0',
};
if (clientId) headers['CF-Access-Client-Id'] = clientId;
if (clientSecret) headers['CF-Access-Client-Secret'] = clientSecret;

const req = clientLib.get(healthUrl, { headers, timeout: 8000 }, (res) => {
  let body = '';
  res.on('data', (d) => (body += d));
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      if (res.statusCode === 200 && data.status === 'healthy') {
        console.log(`[✓] SUCCESS: Connected to VS Code Monitor Bridge!`);
        console.log(JSON.stringify({
          success: true,
          httpUrl: httpBaseUrl,
          wsUrl: wsBaseUrl,
          status: data.status,
          tmuxSession: data.tmuxSession,
          uptimeSeconds: data.uptimeSeconds
        }, null, 2));
        process.exit(0);
      } else {
        console.error(`[!] Server responded with status ${res.statusCode}:`, body);
        process.exit(1);
      }
    } catch {
      if (res.statusCode === 200) {
        console.log(`[✓] Server reached (HTTP 200). Body:`, body);
        process.exit(0);
      } else {
        console.error(`[!] Failed to parse response (HTTP ${res.statusCode}):`, body);
        process.exit(1);
      }
    }
  });
});

req.on('error', (err) => {
  console.error(`[✗] Connection error: ${err.message}`);
  process.exit(1);
});

req.on('timeout', () => {
  req.destroy();
  console.error('[✗] Request timed out. Check domain or Cloudflare ZTNA firewall settings.');
  process.exit(1);
});
