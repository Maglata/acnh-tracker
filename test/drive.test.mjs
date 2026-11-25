import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { createDriveStore } = createRequire(import.meta.url)('../public/js/drive.js');

function fakeDrive() {
  const files = new Map();
  const calls = [];
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
  async function fetch(url, init = {}) {
    const u = new URL(url);
    calls.push(`${init.method ?? 'GET'} ${u.pathname}`);
    if (init.headers?.Authorization !== 'Bearer tok') return json({ error: 'unauthorized' }, 401);
    if (u.pathname === '/drive/v3/files') {
      assert.equal(u.searchParams.get('spaces'), 'appDataFolder');
      return json({ files: [...files.keys()].map((id) => ({ id })) });
    }
    if (u.pathname === '/upload/drive/v3/files' && init.method === 'POST') {
      const meta = JSON.parse(init.body.split('\r\n\r\n')[1].split('\r\n')[0]);
      assert.deepEqual(meta.parents, ['appDataFolder']);
      files.set('f1', init.body.split('\r\n\r\n')[2].split('\r\n')[0]);
      return json({ id: 'f1' });
    }
    const id = u.pathname.split('/').pop();
    if (init.method === 'PATCH') files.set(id, init.body);
    return new Response(files.get(id));
  }
  return { files, calls, fetch };
}

test('creates the file in appDataFolder once, then updates it in place', async () => {
  const fake = fakeDrive();
  const store = createDriveStore({ fetch: fake.fetch, getToken: () => 'tok' });
  assert.equal(await store.load(), null);
  await store.save({ app: 'acnh-tracker', progress: { a: { caught: true } } });
  await store.save({ app: 'acnh-tracker', progress: { b: { caught: true } } });
  assert.equal(fake.files.size, 1);
  assert.deepEqual(await createDriveStore({ fetch: fake.fetch, getToken: () => 'tok' }).load(), {
    app: 'acnh-tracker',
    progress: { b: { caught: true } },
  });
  assert.deepEqual(fake.calls.filter((c) => !c.startsWith('GET')), ['POST /upload/drive/v3/files', 'PATCH /upload/drive/v3/files/f1']);
});

test('reports 401 when the token is missing or rejected', async () => {
  const fake = fakeDrive();
  await assert.rejects(createDriveStore({ fetch: fake.fetch, getToken: () => null }).load(), { status: 401 });
  await assert.rejects(createDriveStore({ fetch: fake.fetch, getToken: () => 'expired' }).load(), { status: 401 });
});
