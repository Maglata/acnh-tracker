#!/usr/bin/env node
// Local server: serves the tracker UI and persists progress to save/progress.json.
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const SAVE_DIR = process.env.ACNH_SAVE_DIR ?? join(ROOT, 'save');
const SAVE_FILE = join(SAVE_DIR, 'progress.json');
const BACKUP_DIR = join(SAVE_DIR, 'backups');
const MAX_BACKUPS = 30;
const MAX_BODY = 2 * 1024 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const send = (res, status, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
};

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Payload too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function backupOncePerDay() {
  const day = new Date().toISOString().slice(0, 10);
  const target = join(BACKUP_DIR, `progress-${day}.json`);
  if (await stat(target).catch(() => null)) return;
  const current = await readFile(SAVE_FILE).catch(() => null);
  if (!current) return;
  await mkdir(BACKUP_DIR, { recursive: true });
  await writeFile(target, current);
  const old = (await readdir(BACKUP_DIR)).filter((f) => f.startsWith('progress-')).sort().slice(0, -MAX_BACKUPS);
  await Promise.all(old.map((f) => rm(join(BACKUP_DIR, f))));
}

async function saveProgress(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || data.app !== 'acnh-tracker') {
    throw Object.assign(new Error('Not an acnh-tracker state'), { status: 400 });
  }
  await mkdir(SAVE_DIR, { recursive: true });
  await backupOncePerDay();
  const tmp = `${SAVE_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n');
  await rename(tmp, SAVE_FILE);
}

async function serveStatic(res, pathname) {
  const rel = normalize(decodeURIComponent(pathname === '/' ? '/index.html' : pathname)).replace(/^([/\\])+/, '');
  const file = join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + sep)) return send(res, 403, 'Forbidden');
  const body = await readFile(file).catch(() => null);
  if (!body) return send(res, 404, 'Not found');
  send(res, 200, body, TYPES[extname(file)] ?? 'application/octet-stream');
}

export function createApp() {
  return createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      if (pathname === '/api/progress') {
        if (req.method === 'GET') {
          const text = await readFile(SAVE_FILE, 'utf8').catch(() => null);
          return text ? send(res, 200, text, TYPES['.json']) : send(res, 204, '');
        }
        if (req.method === 'PUT') {
          await saveProgress(await readBody(req));
          return send(res, 200, JSON.stringify({ ok: true, file: SAVE_FILE }), TYPES['.json']);
        }
        return send(res, 405, 'Method not allowed');
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      return await serveStatic(res, pathname);
    } catch (err) {
      const status = err.status ?? (err instanceof SyntaxError ? 400 : 500);
      if (status === 500) console.error(err);
      send(res, status, err.message);
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4747);
  createApp().listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}`;
    console.log(`ACNH tracker running at ${url}`);
    console.log(`Progress is saved to ${SAVE_FILE}`);
    if (process.platform === 'darwin' && !process.argv.includes('--no-open')) execFile('open', [url]);
  });
}
