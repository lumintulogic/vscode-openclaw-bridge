const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const config = require('./config');

// Ensure PATH includes /config/bin if tmux was installed there
if (!process.env.PATH.includes('/config/bin')) {
  process.env.PATH = `/config/bin:${process.env.PATH}`;
}
if (!process.env.LD_LIBRARY_PATH || !process.env.LD_LIBRARY_PATH.includes('/config/lib')) {
  process.env.LD_LIBRARY_PATH = `/config/lib:${process.env.LD_LIBRARY_PATH || ''}`;
}
if (!process.env.SHELL || process.env.SHELL === '/bin/false') {
  process.env.SHELL = '/bin/bash';
}

const activeSockets = new Set();
let ptyProcess = null;
let ptyBuffer = '';
const MAX_BUFFER_SIZE = 100 * 1024; // 100 KB rolling buffer for newly connecting clients

/**
 * Spawns or connects to the persistent tmux session via node-pty.
 */
function initializePty() {
  const tmuxBin = process.env.TMUX_BIN || 'tmux';
  const sessionName = config.tmuxSession;
  const cliCommand = config.cliCommand;

  // tmux new-session -A -s <sessionName> <cliCommand>
  // -A flag attaches if session exists, otherwise creates it.
  const ptyArgs = ['new-session', '-A', '-s', sessionName, cliCommand];

  console.log(`[PTY] Spawning: ${tmuxBin} ${ptyArgs.join(' ')}`);

  try {
    ptyProcess = pty.spawn(tmuxBin, ptyArgs, {
      name: 'xterm-256color',
      cols: config.cols,
      rows: config.rows,
      cwd: process.env.HOME || process.cwd(),
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
    });

    ptyProcess.onData((data) => {
      // Append to rolling buffer
      ptyBuffer = (ptyBuffer + data).slice(-MAX_BUFFER_SIZE);

      // Broadcast to all connected WebSocket clients
      for (const client of activeSockets) {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(data);
          } catch (err) {
            console.error('[WebSocket] Send error:', err.message);
          }
        }
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      console.warn(`[PTY] Process exited (code: ${exitCode}, signal: ${signal}).`);
      ptyProcess = null;
      // Broadcast notice to clients
      const notice = `\r\n\x1b[33m[Bridge] Session '${sessionName}' ended (code: ${exitCode}). Reconnecting in 3s...\x1b[0m\r\n`;
      for (const client of activeSockets) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(notice);
        }
      }
      setTimeout(initializePty, 3000);
    });
  } catch (err) {
    console.error(`[PTY] Failed to spawn tmux session:`, err.message);
    console.log(`[PTY] Retrying in 5s...`);
    setTimeout(initializePty, 5000);
  }
}

/**
 * Validates Cloudflare Access Service Token headers if configured.
 */
function validateAuth(req) {
  if (!config.cfClientId && !config.cfClientSecret) {
    return true; // No auth required
  }

  const clientId = req.headers['cf-access-client-id'] || req.headers['x-auth-client-id'];
  const clientSecret = req.headers['cf-access-client-secret'] || req.headers['x-auth-client-secret'];

  if (config.cfClientId && clientId !== config.cfClientId) {
    return false;
  }
  if (config.cfClientSecret && clientSecret !== config.cfClientSecret) {
    return false;
  }

  return true;
}

// Create HTTP Server
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, CF-Access-Client-Id, CF-Access-Client-Secret');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health endpoint
  if (url.pathname === '/health') {
    const isHealthy = ptyProcess !== null;
    res.writeHead(isHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: isHealthy ? 'healthy' : 'degraded',
        tmuxSession: config.tmuxSession,
        ptyActive: isHealthy,
        connectedClients: activeSockets.size,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  // Detailed Status endpoint
  if (url.pathname === '/status') {
    if (!validateAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid Cloudflare Service Token' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        service: 'vscode-monitor',
        version: '1.0.0',
        tmuxSession: config.tmuxSession,
        cliCommand: config.cliCommand,
        terminal: {
          cols: config.cols,
          rows: config.rows,
        },
        activeSockets: activeSockets.size,
        uptime: process.uptime(),
      })
    );
    return;
  }

  // Default 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

// WebSocket Server attached to HTTP Server
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (!validateAuth(req)) {
    console.warn(`[WebSocket] Rejected unauthenticated connection from ${socket.remoteAddress}`);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws, req) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`[WebSocket] Client connected from ${clientIp}. Total active: ${activeSockets.size + 1}`);

  activeSockets.add(ws);

  // Send recent terminal history to the newly connected client
  if (ptyBuffer.length > 0) {
    ws.send(ptyBuffer);
  }

  ws.on('message', (message) => {
    if (!ptyProcess) {
      console.warn('[WebSocket] Received input but PTY process is not running');
      return;
    }

    const payload = message.toString();

    // Check if the message is a JSON control command (e.g. resize)
    try {
      if (payload.startsWith('{') && payload.endsWith('}')) {
        const parsed = JSON.parse(payload);
        if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
          console.log(`[PTY] Resizing terminal to ${parsed.cols}x${parsed.rows}`);
          ptyProcess.resize(Number(parsed.cols), Number(parsed.rows));
          return;
        }
        if (parsed.type === 'input' && typeof parsed.data === 'string') {
          ptyProcess.write(parsed.data);
          return;
        }
      }
    } catch {
      // Fall through to treat as raw terminal input string
    }

    // Default: write raw string/key strokes directly to stdin
    ptyProcess.write(payload);
  });

  ws.on('close', () => {
    activeSockets.delete(ws);
    console.log(`[WebSocket] Client disconnected (${clientIp}). Total active: ${activeSockets.size}`);
  });

  ws.on('error', (err) => {
    console.error(`[WebSocket] Client error (${clientIp}):`, err.message);
  });
});

// Start listening and initialize PTY
server.listen(config.port, config.host, () => {
  console.log(`=======================================================`);
  console.log(`[VS Code Monitor Bridge]`);
  console.log(`Listening on       : http://${config.host}:${config.port}`);
  console.log(`WebSocket endpoint : ws://${config.host}:${config.port}`);
  console.log(`Target tmux session: ${config.tmuxSession}`);
  console.log(`CLI Command        : ${config.cliCommand}`);
  console.log(`Cloudflare Auth    : ${config.cfClientId ? 'Enabled (Service Token)' : 'Disabled'}`);
  console.log(`=======================================================`);

  initializePty();
});

// Graceful shutdown handling
function handleShutdown(signal) {
  console.log(`\n[Bridge] Received ${signal}. Shutting down gracefully...`);
  for (const ws of activeSockets) {
    try {
      ws.close(1001, 'Bridge Server Shutting Down');
    } catch {}
  }
  if (ptyProcess) {
    try {
      // Detach pty without killing tmux session
      ptyProcess.kill();
    } catch {}
  }
  server.close(() => {
    console.log('[Bridge] Server closed.');
    process.exit(0);
  });
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
