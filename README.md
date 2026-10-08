# VS Code Stdio Monitor Bridge

A lightweight, robust bidirectional `stdio` bridge between processes running in VS Code Server and external agent frameworks like **OpenClaw**, utilizing `tmux`, `node-pty`, and WebSockets.

---

## Architecture Overview

```
+-------------------------------------------------------------+
| VS Code Server / Container                                  |
|                                                             |
|   +--------------------------+                              |
|   | Human Developer Terminal |                              |
|   | (tmux attach -t agent)   |                              |
|   +------------+-------------+                              |
|                |                                            |
|                v                                            |
|   +------------+-------------+        +-----------------+   |
|   |  tmux (agent-session)    |<------>| node-pty Bridge |   |
|   |  Runs CLI harness / bash |        +--------+--------+   |
|   +--------------------------+                 |            |
|                                                | (WS / HTTP)|
+------------------------------------------------v------------+
                                                 |
                       [ Cloudflare ZTNA / Local Bridge Net ]
                                                 |
                                                 v
                                        +-----------------+
                                        | OpenClaw Agent  |
                                        | Monitor/Control |
                                        +-----------------+
```

### Key Features
- **Concurrent Human + Agent Control**: The target CLI or agent harness is hosted inside a persistent `tmux` session. A developer can attach from VS Code (`scripts/attach-session.sh` or `tmux attach-session -t agent-session`) to observe or type at any time without terminating the agent connection.
- **Full Bidirectional I/O**: Streams `stdout`/`stderr` live to OpenClaw via WebSockets and pipes OpenClaw input straight into `stdin`.
- **Terminal Resizing**: OpenClaw or remote viewers can adjust terminal dimensions dynamically via `{ "type": "resize", "cols": 120, "rows": 40 }`.
- **Rolling Buffer History**: Newly connecting WebSocket clients immediately receive recent terminal output.
- **Cloudflare ZTNA Ready**: Optionally enforces Cloudflare Access Service Token validation (`CF-Access-Client-Id` and `CF-Access-Client-Secret`).
- **Health & Status Endpoints**: Provides `/health` and `/status` HTTP endpoints.

---

## Quick Start

### 1. Installation

Install Node dependencies (which compiles the `node-pty` native C++ addon):
```bash
npm install
```

Ensure `tmux` is available:
```bash
# Ubuntu / Debian
sudo apt-get install -y tmux
```

### 2. Start the Monitor Bridge

Start the bridge server:
```bash
npm start
# Or run with helper script:
./scripts/start-bridge.sh
```

By default, the server will start listening on `http://0.0.0.0:8090` and attach to/create the `tmux` session named `agent-session`.

### 3. Connect as a Human Developer in VS Code

Open a terminal in VS Code and run:
```bash
./scripts/attach-session.sh
```
To detach without terminating the session: press `Ctrl+B`, then `D`.

### 4. Run Verification Client Test

Verify bidirectional WebSocket communication:
```bash
npm run test:client
```

---

## Configuration (`.env`)

You can create a `.env` file from `.env.example`:
```ini
PORT=8090
HOST=0.0.0.0
TMUX_SESSION=agent-session
CLI_COMMAND=bash
PTY_COLS=120
PTY_ROWS=40

# Cloudflare Zero Trust Access Service Token (Optional)
CF_ACCESS_CLIENT_ID=
CF_ACCESS_CLIENT_SECRET=
```

---

## OpenClaw Agent Integration

### Registering & Installing as a Skill via Chat

This repository is structured as a native OpenClaw skill (`SKILL.md` and `skill.json` at root). You can register and install it directly through chat in OpenClaw.

#### 1. Install via Chat Prompt
Send either of the following into your OpenClaw chat (Telegram, Discord, Slack, or Web UI):

```text
/openclaw skills install https://github.com/lumintulogic/vscode-openclaw-bridge
```
or
> *"Please install and register the skill from https://github.com/lumintulogic/vscode-openclaw-bridge"*

#### 2. Interactive Chat Configuration
If configuration is needed, OpenClaw will prompt you in chat:

> **OpenClaw**:
> *"To connect to your VS Code Server terminal monitor, please provide:*
> 1. *VS Code Server URL (e.g. `https://vscode.yourdomain.com` or `http://localhost:8090`)*
> 2. *Cloudflare Access Client ID (optional)*
> 3. *Cloudflare Access Client Secret (optional)"*

Provide your values directly in the conversation:
> **User**:
> *"URL is `https://vscode.example.com`, Client ID is `xxx.access`, Secret is `yyy`"*

OpenClaw will run `node scripts/setup.js`, verify the connection over HTTP and WebSocket, and confirm that the skill is ready.

#### 3. Command Execution from Chat
Once registered, OpenClaw can monitor and run commands in your VS Code terminal:
> **User in Chat**: *"Run `npm test` in the VS Code terminal and report the output"*
>
> **OpenClaw**: *(Executes `node scripts/send_command.js "npm test"` and streams results back into chat)*

---

### Example 1: Node.js WebSocket Client
```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://vscode-server:8090', {
  headers: {
    'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID || '',
    'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET || ''
  }
});

ws.on('open', () => {
  console.log('[OpenClaw] Connected to VS Code agent stdio');
  // Send a command to stdin
  ws.send('npm test\n');
});

ws.on('message', (data) => {
  // Real-time stdout/stderr from VS Code
  process.stdout.write(data.toString());
});
```

### Example 2: Python Client
```python
import asyncio
import websockets

async def monitor():
    uri = "ws://vscode-server:8090"
    headers = {
        "CF-Access-Client-Id": "...",
        "CF-Access-Client-Secret": "..."
    }
    async with websockets.connect(uri, additional_headers=headers) as ws:
        # Send input to stdin
        await ws.send("date\n")
        
        # Listen for output
        while True:
            output = await ws.recv()
            print(output, end="")

asyncio.run(monitor())
```

---

## Endpoints

| Endpoint | Protocol | Description |
|---|---|---|
| `/` | `ws://` | Bidirectional terminal stream and control |
| `/health` | `http://` | Liveness check (`{"status":"healthy", ...}`) |
| `/status` | `http://` | Server & terminal details, client count, uptime |
