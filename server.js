#!/usr/bin/env node
/**
 * Serves the games and js/ from the project root. Binds to 0.0.0.0 so devices on LAN can connect.
 * POST /log → prints engage row to stdout + fans out to /logs/stream SSE clients.
 * Vitals are computed in-browser via inference (webcam rPPG); no server-side vitals.
 * Run: node server.js  or  npm run serve
 */
require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = parseInt(process.env.PORT || '8765', 10);
const HOST = '0.0.0.0';
const ROOT = path.join(__dirname);

function getLanIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const MIMES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

const logSseClients = new Set();
const logHistory = [];
const MAX_LOG_HISTORY = 200;

function broadcastLog(line) {
  logHistory.push(line);
  if (logHistory.length > MAX_LOG_HISTORY) logHistory.shift();
  const msg = `data: ${JSON.stringify(line)}\n\n`;
  for (const res of logSseClients) {
    res.write(msg);
  }
}

const GAME_HTML = /^\/games\/(snake|bird|dino)\.html$/i;
const ENGAGE_BOOTSTRAP = '<script src="/js/engage-bootstrap.js"></script>';

function serve(pathname, res) {
  const file = path.join(ROOT, pathname.replace(/^\//, ''));
  const isGameHtml = GAME_HTML.test(pathname);
  fs.readFile(file, isGameHtml ? 'utf8' : null, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(file);
    res.setHeader('Content-Type', MIMES[ext] || 'application/octet-stream');
    if (isGameHtml && typeof data === 'string') {
      const hasBootstrap = /engage-bootstrap\.js/i.test(data);
      const injected = hasBootstrap ? data : data.replace(/\s*<\/body\s*>/i, '\n' + ENGAGE_BOOTSTRAP + '\n</body>');
      res.end(injected);
    } else {
      res.end(data);
    }
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'GET' && req.url === '/logs/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    for (const line of logHistory) {
      res.write(`data: ${JSON.stringify(line)}\n\n`);
    }
    logSseClients.add(res);
    req.on('close', () => logSseClients.delete(res));
    return;
  }

  if (req.method === 'POST' && req.url === '/log') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.type === 'mod') {
          const red = '\x1b[31m' + (data.message || '') + '\x1b[0m';
          console.log(red);
          broadcastLog(data.message || '');
        } else {
          const row = Array.isArray(data) ? data : (data.vector || []);
          const line = row.map((v) => (typeof v === 'number' ? (v % 1 === 0 ? String(v) : Number(v).toFixed(2)) : (v == null ? '' : v))).join('\t');
          const statePart = data.gameState && Object.keys(data.gameState).length
            ? '\t|\t' + Object.values(data.gameState).map((v) => (v == null ? '' : v)).join('\t')
            : '';
          console.log(line + statePart);
          broadcastLog(line + statePart);
        }
      } catch (e) {
        console.log(body);
        broadcastLog(body);
      }
      res.writeHead(204);
      res.end();
    });
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405);
    res.end();
    return;
  }
  let pathname = req.url.split('?')[0] || '/';
  if (pathname === '/') pathname = '/index.html';
  serve(pathname, res);
});

const lanIP = getLanIP();

server.listen(PORT, HOST, () => {
  console.log(`Server at http://localhost:${PORT}`);
  console.log(`LAN:      http://${lanIP}:${PORT}`);
  console.log('');
  console.log('Games (vitals from in-browser inference):');
  console.log(`  http://${lanIP}:${PORT}/games/snake.html?logToServer=1`);
  console.log(`  http://${lanIP}:${PORT}/games/bird.html?logToServer=1`);
  console.log(`  http://${lanIP}:${PORT}/games/dino.html?logToServer=1`);
  console.log('');
  broadcastLog('[Server] Started on ' + lanIP + ':' + PORT);
});
