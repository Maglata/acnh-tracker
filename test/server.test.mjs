import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir;
let server;
let base;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'acnh-'));
  process.env.ACNH_SAVE_DIR = dir;
  const { createApp } = await import('../server.mjs');
  server = createApp();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

const put = (body) => fetch(`${base}/api/progress`, { method: 'PUT', body: typeof body === 'string' ? body : JSON.stringify(body) });

test('progress round-trips through save/progress.json and is backed up daily', async () => {
  assert.equal((await fetch(`${base}/api/progress`)).status, 204);
  const first = { app: 'acnh-tracker', version: 1, progress: { 'fish-koi': { caught: true } } };
  assert.equal((await put(first)).status, 200);
  const second = { ...first, progress: { 'fish-koi': { caught: true, donated: true } } };
  assert.equal((await put(second)).status, 200);

  assert.deepEqual(await (await fetch(`${base}/api/progress`)).json(), second);
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'progress.json'), 'utf8')), second);
  const backups = await readdir(join(dir, 'backups'));
  assert.equal(backups.length, 1);
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'backups', backups[0]), 'utf8')), first);
});

test('rejects payloads that are not tracker state', async () => {
  assert.equal((await put('{nope')).status, 400);
  assert.equal((await put({ app: 'something-else' })).status, 400);
});

test('serves the app but not files outside public/', async () => {
  const index = await fetch(`${base}/`);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /ACNH Critter Tracker/);
  assert.notEqual((await fetch(`${base}/..%2fpackage.json`)).status, 200);
  assert.notEqual((await fetch(`${base}/img/..%2f..%2fserver.mjs`)).status, 200);
});
