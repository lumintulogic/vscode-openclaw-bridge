---
name: vscode-stdio-monitor
description: Monitor and interact bidirectionally with VS Code Server CLI agents and terminal sessions via tmux WebSocket bridge. Use to observe stdout/stderr, send stdin commands, and coordinate with developers in VS Code.
version: 1.0.0
metadata:
  openclaw:
    category: developer-tools
    requires:
      bins:
        - node
      env:
        - VSCODE_MONITOR_URL
    install:
      chat: true
      command: "node scripts/setup.js"
    config:
      host:
        type: string
        description: "VS Code Server URL (e.g. https://vscode.yourdomain.com or http://localhost:8090)"
        prompt: "Enter your VS Code Server URL (e.g. https://vscode.yourdomain.com or http://localhost:8090):"
        required: true
      clientId:
        type: string
        description: "Cloudflare Access Client ID (CF-Access-Client-Id)"
        prompt: "Enter Cloudflare Access Client ID (leave blank if not using Cloudflare Access):"
        required: false
      clientSecret:
        type: string
        description: "Cloudflare Access Client Secret (CF-Access-Client-Secret)"
        prompt: "Enter Cloudflare Access Client Secret (leave blank if not using Cloudflare Access):"
        secret: true
        required: false
---

# VS Code Stdio Monitor Skill for OpenClaw

This skill enables OpenClaw agents to connect to a running VS Code Server instance, monitor `stdout`/`stderr` from developer CLI sessions in real-time, and send interactive `stdin` commands without interfering with human developer terminal access.

---

## 1. Registering & Installing This Skill via Chat

OpenClaw supports registering skills directly through conversational chat (in Web UI, Slack, Discord, Telegram, or WhatsApp).

### Chat Installation Trigger

The user can install this skill from chat by sending either of the following:

- **Command Syntax**:
  ```text
  /openclaw skills install https://github.com/lumintulogic/vscode-openclaw-bridge
  ```
- **Natural Language Prompt**:
  > *"Please install and register the skill from https://github.com/lumintulogic/vscode-openclaw-bridge"*

OpenClaw clones the repository directly into its skills directory (e.g., `~/.openclaw/skills/vscode-stdio-monitor`) and detects `SKILL.md` and `skill.json` at the root.

---

### Interactive Registration Flow in Chat

When the skill is being registered or activated, if configuration parameters are not already present in `.env`, **OpenClaw should guide the user interactively in chat**:

#### Step 1: OpenClaw asks the user for connection parameters
> **OpenClaw**:
> *"To connect and register the **VS Code Stdio Monitor** skill, please provide:*
> 1. **VS Code Server URL**: *(e.g., `https://vscode.yourdomain.com` or `http://localhost:8090`)*
> 2. **Cloudflare Access Client ID**: *(optional, leave blank if not using Cloudflare ZTNA)*
> 3. **Cloudflare Access Client Secret**: *(optional, leave blank if not using Cloudflare ZTNA)*"

#### Step 2: User provides details in chat
> **User**:
> *"URL is `https://vscode.myteam.org`, Client ID is `abcd123.access`, and Secret is `secret456`"*
>
> *(Or single-line format)*:
> *"Register with host https://vscode.myteam.org client-id abcd123.access client-secret secret456"*

#### Step 3: OpenClaw executes setup and verification
OpenClaw executes the bundled setup script:
```bash
node scripts/setup.js --host "<VSCODE_URL>" \
                      --client-id "<CF_CLIENT_ID>" \
                      --client-secret "<CF_CLIENT_SECRET>"
```

The setup script automatically:
1. Normalizes the domain and code-server proxy paths (`/proxy/8090/`).
2. Generates the WebSocket URL (`wss://...`).
3. Saves credentials into `.env`.
4. Performs an HTTP `/health` probe and tests the WebSocket handshake.
5. Returns a structured JSON result.

#### Step 4: OpenClaw confirms registration to user
> **OpenClaw**:
> *"✓ **VS Code Stdio Monitor** registered successfully!*
> - **Bridge Endpoint**: `https://vscode.myteam.org/proxy/8090/health` (HTTP) / `wss://...` (WebSocket)
> - **Active Session**: `agent-session`
> - **Status**: `healthy` (PTY active)
>
> *I can now monitor and run commands in your VS Code terminal.*"*

---

## 2. Configuration & Environment Variables

| Variable | Required | Description | Example |
|---|---|---|---|
| `VSCODE_MONITOR_URL` | Yes | WebSocket URL for the terminal stream | `wss://vscode.yourdomain.com/proxy/8090/` or `ws://127.0.0.1:8090/` |
| `VSCODE_HTTP_URL` | Yes | HTTP base URL for health/status probes | `https://vscode.yourdomain.com/proxy/8090` or `http://127.0.0.1:8090` |
| `CF_ACCESS_CLIENT_ID` | Optional | Cloudflare ZTNA Service Token Client ID | `xxxxxx.access` |
| `CF_ACCESS_CLIENT_SECRET` | Optional | Cloudflare ZTNA Service Token Secret | `yyyyyy...` |

---

## 3. Agent Usage Instructions

### 1. Check Health & Connectivity
Before interacting with the terminal, verify the bridge is active and healthy:

```bash
curl -s -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
        -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
        "$VSCODE_HTTP_URL/health"
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
Send commands to the terminal `stdin` and await output:

```bash
node scripts/send_command.js "ls -la"
```

Or via Python:
```python
import asyncio
import websockets
import os

async def send_command(cmd: str):
    url = os.getenv("VSCODE_MONITOR_URL", "ws://127.0.0.1:8090/")
    headers = {}
    if os.getenv("CF_ACCESS_CLIENT_ID"):
        headers["CF-Access-Client-Id"] = os.getenv("CF_ACCESS_CLIENT_ID")
        headers["CF-Access-Client-Secret"] = os.getenv("CF_ACCESS_CLIENT_SECRET")

    async with websockets.connect(url, additional_headers=headers) as ws:
        # Initial history buffer
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
To send interactive keystrokes (e.g., `Ctrl+C`, `Ctrl+D`, confirmation responses):

- **Ctrl+C**: Send `\x03`
- **Enter**: Send `\r` or `\n`
- **Tab**: Send `\t`

Example:
```bash
node scripts/send_command.js --raw $'\x03'
```

### 4. Terminal Resizing
To adjust terminal dimensions dynamically for formatted tables or wide outputs:

```json
{
  "type": "resize",
  "cols": 140,
  "rows": 50
}
```

---

## 4. Troubleshooting

1. **HTTP 401 Unauthorized**:
   - Verify `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` match your Cloudflare Access Service Token.
2. **Status "degraded" / ptyActive: false**:
   - The tmux session was closed or exited. The bridge automatically restarts the session within 3 seconds.
3. **Connection Refused**:
   - Ensure the bridge daemon is running (`node src/server.js` or `./scripts/start-bridge.sh`).
4. **Re-registering or Updating Configuration**:
   - Simply run `node scripts/setup.js --host "<NEW_URL>"` or ask OpenClaw in chat to re-register the skill.
