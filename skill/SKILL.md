---
name: vscode-stdio-monitor
description: Monitor and interact bidirectionally with VS Code Server CLI agents and terminal sessions via tmux WebSocket bridge. Use to observe stdout/stderr, send stdin commands, and coordinate with developers in VS Code.
---

# VS Code Stdio Monitor Skill for OpenClaw

This skill enables OpenClaw agents to connect to a running VS Code Server instance, monitor `stdout`/`stderr` from developer CLI sessions in real-time, and send interactive `stdin` commands without interfering with human developer terminal access.

## Architecture & How It Works

1. **Target Session**: The CLI harness or shell inside VS Code runs in a persistent `tmux` session (`agent-session`).
2. **Bridge Service**: The VS Code Monitor Bridge daemon runs on port `8090` (or configured port) exposing:
   - `GET /health`: Server liveness and active session check.
   - `GET /status`: Server configuration and connected client stats.
   - `ws://<host>:<port>`: Real-time bidirectional WebSocket stream.
3. **Dual Human/Agent Access**: Human developers can attach to the session in VS Code using `tmux attach -t agent-session` at any time.

---

## Interactive Setup & Provisioning (Chat Mode)

When installing or activating this skill, OpenClaw should proactively inquire the user in chat for configuration details if they are not already set:

> **OpenClaw Prompt to User**:
> *"To connect to your VS Code Server terminal monitor, please provide:*
> 1. *VS Code Server URL (e.g., `https://vscode.yourdomain.com`)*
> 2. *Cloudflare Access Client ID (`CF-Access-Client-Id`)*
> 3. *Cloudflare Access Client Secret (`CF-Access-Client-Secret`)"*

Once the user provides the details in chat, OpenClaw executes:
```bash
node scripts/setup.js --host "<VSCODE_URL>" \
                      --client-id "<CF_CLIENT_ID>" \
                      --client-secret "<CF_CLIENT_SECRET>"
```
This automatically formats the URLs (`https://<host>/proxy/8090/`), saves the credentials into `.env`, runs an end-to-end health probe through Cloudflare Access, and confirms the connection status back to the user.

---

## Configuration & Environment Variables

| Variable | Required | Description | Example |
|---|---|---|---|
| `VSCODE_MONITOR_URL` | Yes (External) | WebSocket URL through VS Code proxy | `wss://vscode.yourdomain.com/proxy/8090/` |
| `VSCODE_HTTP_URL` | Yes (External) | HTTP Base URL through VS Code proxy | `https://vscode.yourdomain.com/proxy/8090` |
| `CF_ACCESS_CLIENT_ID` | Required for CF | Cloudflare Service Token Client ID | `xxxxxx.access` |
| `CF_ACCESS_CLIENT_SECRET` | Required for CF | Cloudflare Service Token Secret | `yyyyyy...` |

---

## Agent Usage Instructions

### 1. Check Health & Connectivity
Test connectivity through Cloudflare Access:

```bash
curl -s -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
        -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
        https://vscode.yourdomain.com/proxy/8090/health
```

Expected JSON response:
```json
{
  "status": "healthy",
  "tmuxSession": "agent-session",
  "ptyActive": true,
  "connectedClients": 0,
  "uptimeSeconds": 120
}
```

### 2. Execute a Command & Capture Output
Use the bundled runner script to send a command to the terminal `stdin` and await output:

```bash
node scripts/send_command.js "ls -la"
```

Or via Python:
```python
import asyncio
import websockets
import os

async def send_command(cmd: str):
    url = os.getenv("VSCODE_MONITOR_URL", "ws://127.0.0.1:8090")
    headers = {}
    if os.getenv("CF_ACCESS_CLIENT_ID"):
        headers["CF-Access-Client-Id"] = os.getenv("CF_ACCESS_CLIENT_ID")
        headers["CF-Access-Client-Secret"] = os.getenv("CF_ACCESS_CLIENT_SECRET")

    async with websockets.connect(url, additional_headers=headers) as ws:
        # Initial greeting / history buffer
        initial_buffer = await ws.recv()
        
        # Send command with newline
        await ws.send(f"{cmd}\n")
        
        # Read output
        try:
            while True:
                chunk = await asyncio.wait_for(ws.recv(), timeout=3.0)
                print(chunk, end="")
        except asyncio.TimeoutError:
            pass

asyncio.run(send_command("npm test"))
```

### 3. Send Control Characters & Keystrokes
To send interactive keystrokes (e.g. `Ctrl+C`, `Ctrl+D`, confirmation prompts):

- **Ctrl+C**: Send `\x03`
- **Enter**: Send `\r` or `\n`
- **Tab**: Send `\t`

Example:
```bash
node scripts/send_command.js --raw $'\x03'
```

### 4. Terminal Resizing
If output wrapping or table formatting requires specific terminal dimensions, send a JSON control payload:

```json
{
  "type": "resize",
  "cols": 140,
  "rows": 50
}
```

---

## Error Handling & Troubleshooting

1. **HTTP 401 Unauthorized**:
   - Ensure `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` match the Cloudflare Access Service Token configured on the VS Code container.
2. **Status "degraded" / ptyActive: false**:
   - The tmux session was closed or exited. The bridge automatically restarts the session within 3 seconds.
3. **Connection Refused**:
   - Ensure the bridge daemon is running (`node src/server.js` or `./scripts/start-bridge.sh`).
