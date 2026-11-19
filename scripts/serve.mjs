#!/usr/bin/env node
// 本機開發伺服器：提供 site/ 靜態檔，並以 POST /api/refresh 重新抓取資料。
// 只綁定 127.0.0.1。用法：npm run serve（PORT 環境變數可改埠號，預設 5173）

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = join(root, 'site');
const port = Number(process.env.PORT ?? 5173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

let running = null;

function runFetch() {
  running ??= new Promise((resolveRun) => {
    const child = spawn(process.execPath, [join(root, 'scripts/fetch-data.mjs')], { cwd: root });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => {
      running = null;
      resolveRun({ ok: code === 0, output: out.trim() });
    });
  });
  return running;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/refresh') {
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' }).end();
      return;
    }
    const r = await runFetch();
    console.log(r.output);
    res.writeHead(r.ok ? 200 : 500, { 'Content-Type': TYPES['.json'] });
    res.end(JSON.stringify({ ok: r.ok, output: r.output, error: r.ok ? null : r.output.split('\n').pop() }));
    return;
  }

  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(siteDir, p));
  if (!file.startsWith(siteDir + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`▶ http://localhost:${port}/`);
});
