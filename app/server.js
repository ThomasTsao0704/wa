/**
 * 本機開發伺服器
 * - 提供靜態檔案服務
 * - /proxy?url= 代理 TWSE / TPEX API（繞過 CORS）
 *
 * 啟動：node server.js
 * 瀏覽：http://localhost:3000/
 *
 * 不需要安裝任何 npm 套件，只需 Node.js 18+
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const PORT = 3000;
const ROOT = __dirname;

/* ── MIME 類型 ─────────────────────────────── */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
};

/* ── 代理請求（/proxy?url=...） ──────────────── */
function handleProxy(req, res) {
  const { query } = url.parse(req.url, true);
  const targetUrl = query.url;

  if (!targetUrl) {
    res.writeHead(400, corsHeaders('application/json'));
    return res.end(JSON.stringify({ error: 'Missing ?url= parameter' }));
  }

  const parsed = url.parse(targetUrl);
  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;

  const options = {
    hostname: parsed.hostname,
    port:     parsed.port || (isHttps ? 443 : 80),
    path:     parsed.path,
    method:   'GET',
    headers: {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept':          'application/json, text/html, */*',
      'Accept-Language': 'zh-TW,zh;q=0.9',
      'Referer':         `${parsed.protocol}//${parsed.hostname}/`,
    },
  };

  const proxyReq = lib.request(options, proxyRes => {
    const ct = proxyRes.headers['content-type'] || 'application/json';
    res.writeHead(proxyRes.statusCode, corsHeaders(ct));
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    res.writeHead(502, corsHeaders('application/json'));
    res.end(JSON.stringify({ error: err.message }));
  });

  proxyReq.end();
}

/* ── 靜態檔案服務 ────────────────────────────── */
function handleStatic(req, res) {
  let filePath = path.join(ROOT, url.parse(req.url).pathname);

  // 預設首頁
  if (filePath === path.join(ROOT, '/') || filePath === ROOT) {
    filePath = path.join(ROOT, 'index.html');
  }

  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found: ' + filePath);
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

/* ── CORS Headers ────────────────────────────── */
function corsHeaders(contentType) {
  return {
    'Content-Type':                 contentType,
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Cache-Control':                'no-cache',
  };
}

/* ── 主伺服器 ────────────────────────────────── */
const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders('text/plain'));
    return res.end();
  }

  const pathname = url.parse(req.url).pathname;

  if (pathname === '/proxy') {
    handleProxy(req, res);
  } else {
    handleStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`\n✅ 本機伺服器啟動成功`);
  console.log(`   http://localhost:${PORT}/              每日收盤行情`);
  console.log(`   http://localhost:${PORT}/fh-analysis.html    金控分析`);
  console.log(`   http://localhost:${PORT}/index.html          首頁`);
  console.log(`\n   代理 API：http://localhost:${PORT}/proxy?url=<encoded_url>`);
  console.log(`\n   按 Ctrl+C 停止伺服器\n`);
});
