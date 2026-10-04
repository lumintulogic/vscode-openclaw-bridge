const WebSocket = require('ws');

const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:8090';
const TEST_TOKEN = `OPENCLAW_TEST_${Date.now()}`;
const HEADERS = {};

if (process.env.CF_ACCESS_CLIENT_ID) {
  HEADERS['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
}
if (process.env.CF_ACCESS_CLIENT_SECRET) {
  HEADERS['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
}

console.log(`[TestClient] Connecting to ${WS_URL}...`);
const ws = new WebSocket(WS_URL, { headers: HEADERS });

let receivedOutput = '';
let testPassed = false;
let timeoutHandle = null;

timeoutHandle = setTimeout(() => {
  if (!testPassed) {
    console.error(`[TestClient] FAILED: Did not receive expected test token (${TEST_TOKEN}) within 10 seconds.`);
    console.error(`[TestClient] Output received so far:\n---\n${receivedOutput}\n---`);
    ws.close();
    process.exit(1);
  }
}, 10000);

ws.on('open', () => {
  console.log('[TestClient] Connected to bridge WebSocket.');

  // Test resize command
  console.log('[TestClient] Sending terminal resize command...');
  ws.send(JSON.stringify({ type: 'resize', cols: 100, rows: 30 }));

  // Give tmux a brief moment to stabilize and send test echo
  setTimeout(() => {
    console.log(`[TestClient] Sending test command to stdin: echo "${TEST_TOKEN}"`);
    ws.send(`echo "${TEST_TOKEN}"\n`);
  }, 1000);
});

ws.on('message', (data) => {
  const text = data.toString();
  receivedOutput += text;

  // Print sanitized text
  process.stdout.write(text);

  if (receivedOutput.includes(TEST_TOKEN) && !testPassed) {
    testPassed = true;
    clearTimeout(timeoutHandle);
    console.log(`\n\x1b[32m[TestClient] SUCCESS: Test token "${TEST_TOKEN}" detected in stdout stream!\x1b[0m`);

    setTimeout(() => {
      ws.close();
      console.log('[TestClient] Test completed successfully.');
      process.exit(0);
    }, 500);
  }
});

ws.on('error', (err) => {
  console.error('[TestClient] WebSocket error:', err.message);
  clearTimeout(timeoutHandle);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log(`[TestClient] Connection closed (code: ${code}, reason: ${reason || 'none'}).`);
});
