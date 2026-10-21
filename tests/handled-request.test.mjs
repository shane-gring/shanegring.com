// Exercises the public build request at /api/handled/request against a fake
// R2 and a fake KV. This is the one route that mints an intake credential with
// no secret in front of it, so the cases that matter most are the refusals:
// the honeypot, bad input, and the two rate limits.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/handled/request.js';
import { readRecord } from '../functions/lib/handled-store.js';

function fakeBucket() {
  const store = new Map();
  return {
    store,
    async get(key) {
      const v = store.get(key);
      return v === undefined ? null : { text: async () => v, etag: 'e' };
    },
    async put(key, value) {
      store.set(key, String(value));
      return {};
    },
  };
}

function fakeKV(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async put(key, value) { store.set(key, value); },
  };
}

function call(body, env, { ip = '203.0.113.7' } = {}) {
  const posted = [];
  const waits = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { posted.push({ url, body: JSON.parse(init.body) }); return new Response('{}'); };
  const context = {
    env,
    request: new Request('https://shanegring.com/api/handled/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    waitUntil: (p) => waits.push(p),
  };
  return onRequestPost(context).then(async (res) => {
    await Promise.all(waits);
    globalThis.fetch = realFetch;
    return { res, data: await res.json(), posted };
  });
}

const GOOD = {
  name: 'Dana Reyes',
  email: 'Dana@AcmePlumbing.com ',
  business: 'Acme Plumbing',
  website: 'acmeplumbing.com',
  page: '/handled/first-pass/see-it-first',
  utm: { source: 'linkedin', campaign: 'handled-start', content: '<script>' },
};

test('a good request mints a working intake link marked as a request', async () => {
  const env = { HANDLED_BUCKET: fakeBucket(), SCAN_KV: fakeKV(), HANDLED_SHEET_URL: 'https://script.example/exec' };
  const { res, data, posted } = await call(GOOD, env);

  assert.equal(res.status, 200);
  assert.equal(data.ok, true);
  const m = /^https:\/\/shanegring\.com\/handled-intake#t=([A-Za-z0-9_-]{43})$/.exec(data.url);
  assert.ok(m, data.url);

  const { record } = await readRecord(env, m[1]);
  assert.equal(record.source, 'request');
  assert.equal(record.status, 'draft');
  assert.equal(record.firstName, 'Dana');
  assert.equal(record.request.email, 'dana@acmeplumbing.com');
  assert.equal(record.request.page, '/handled/first-pass/see-it-first');
  assert.equal(record.request.campaign, 'linkedin / handled-start / script');
  // Nothing pre-filled, so they still meet the Welcome screen.
  assert.deepEqual(record.answers, {});

  assert.equal(posted.length, 1);
  assert.equal(posted[0].body.kind, 'handled-request');
  assert.equal(posted[0].body.url, data.url);
  assert.equal(posted[0].body.business, 'Acme Plumbing');
});

test('a filled honeypot gets a success shape and no link', async () => {
  const env = { HANDLED_BUCKET: fakeBucket(), SCAN_KV: fakeKV() };
  const { res, data } = await call({ ...GOOD, company: 'Bot Inc' }, env);
  assert.equal(res.status, 200);
  assert.deepEqual(data, { ok: true });
  assert.equal(env.HANDLED_BUCKET.store.size, 0);
});

test('email alone is enough: no name, business or site', async () => {
  const env = { HANDLED_BUCKET: fakeBucket(), HANDLED_SHEET_URL: 'https://script.example/exec' };
  const { res, data, posted } = await call({ email: 'dana@acmeplumbing.com', page: '/handled/first-pass' }, env);
  assert.equal(res.status, 200);
  const { record } = await readRecord(env, /#t=(.+)$/.exec(data.url)[1]);
  assert.equal(record.firstName, '');
  assert.equal(record.label, 'dana@acmeplumbing.com (requested)');
  assert.equal(posted[0].body.name, '');
  assert.equal(posted[0].body.business, '');
});

test('without a business, the site names the request', async () => {
  const env = { HANDLED_BUCKET: fakeBucket() };
  const { data } = await call({ email: 'dana@acmeplumbing.com', website: 'acmeplumbing.com' }, env);
  const { record } = await readRecord(env, /#t=(.+)$/.exec(data.url)[1]);
  assert.equal(record.label, 'acmeplumbing.com (requested)');
});

test('bad email, missing email, junk body are refused', async () => {
  const env = { HANDLED_BUCKET: fakeBucket() };
  for (const body of [{ ...GOOD, email: 'dana@' }, { ...GOOD, email: '' }, 'not json']) {
    const { res } = await call(body, env);
    assert.equal(res.status, 400);
  }
  assert.equal(env.HANDLED_BUCKET.store.size, 0);
});

test('the per-IP hourly limit refuses the sixth request from one address', async () => {
  const env = { HANDLED_BUCKET: fakeBucket(), SCAN_KV: fakeKV() };
  for (let i = 0; i < 5; i++) assert.equal((await call(GOOD, env)).res.status, 200);
  assert.equal((await call(GOOD, env)).res.status, 429);
  // Somebody else is unaffected.
  assert.equal((await call(GOOD, env, { ip: '198.51.100.2' })).res.status, 200);
});

test('the site-wide daily cap refuses everyone once reached', async () => {
  const day = new Date().toISOString().slice(0, 10);
  const env = { HANDLED_BUCKET: fakeBucket(), SCAN_KV: fakeKV({ [`hreq:day:${day}`]: '40' }) };
  const { res } = await call(GOOD, env);
  assert.equal(res.status, 429);
  assert.equal(env.HANDLED_BUCKET.store.size, 0);
});

test('no bucket means a 503, not a link that leads nowhere', async () => {
  const { res } = await call(GOOD, {});
  assert.equal(res.status, 503);
});
