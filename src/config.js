require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '8090', 10),
  host: process.env.HOST || '0.0.0.0',
  tmuxSession: process.env.TMUX_SESSION || 'agent-session',
  cliCommand: process.env.CLI_COMMAND || 'bash',
  cfClientId: process.env.CF_ACCESS_CLIENT_ID || '',
  cfClientSecret: process.env.CF_ACCESS_CLIENT_SECRET || '',
  cols: parseInt(process.env.PTY_COLS || '120', 10),
  rows: parseInt(process.env.PTY_ROWS || '40', 10),
};
