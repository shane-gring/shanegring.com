// Exercises the Stripe webhook at /api/stripe-handled against a fake R2 and a
// fake Stripe, because the real one cannot be made to sign a request on demand.
//
// The signature check is the whole security of this route: it mints an intake
// credential off an inbound HTTP request, and the only thing standing between a
// stranger and a free Handled build is that HMAC. So the cases that matter are
// the ones where it must REFUSE — wrong secret, replayed timestamp, no header —
// and those get as much attention as the happy path.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/stripe-handled.js';

const SECRET = 'whsec_testsecretvalue';
const PLINK = 'plink_1HandledBuild';

// A stand-in for the R2 binding. Only the three methods the route touches.
function fakeBucket() {
  const store = new Map();
  return {
    store,
    async head(key) {
      return store.has(key) ? { key } : null;
    },
    async get(key) {
      const v = store.get(key);
      return v === undefined ? null : { text: async () => v };
    },
    async put(key, value) {
      store.set(key, typeof value === 'string' ? value : String(value));
    },
  };
}

async function sign(secret, payload, timestamp) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function checkoutEvent({ id = 'evt_1', paymentLink = PLINK } = {}) {
  return JSON.stringify({
    id,
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'cs_test_1',
        payment_link: paymentLink,
        amount_total: 30000,
        currency: 'usd',
        customer_details: { name: 'Acme Plumbing', email: 'ray@acmeplumbing.com' },
      },
    },
  });
}

async function call(body, { secret = SECRET, timestamp, env = {}, mails = [] } = {}) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const sig = `t=${ts},v1=${await sign(secret, body, ts)}`;

  const fullEnv = {
    HANDLED_BUCKET: fakeBucket(),
    STRIPE_WEBHOOK_SECRET: SECRET,
    HANDLED_PAYMENT_LINK: PLINK,
    ...env,
  };

  const request = new Request('https://shanegring.com/api/stripe-handled', {
    method: 'POST',
    headers: { 'Stripe-Signature': sig, 'Content-Type': 'application/json' },
    body,
  });

  const waits = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    mails.push({ url, body: JSON.parse(init.body) });
    return new Response('{}');
  };
  try {
    const response = await onRequestPost({
      request,
      env: fullEnv,
      waitUntil: (p) => waits.push(p),
    });
    await Promise.all(waits);
    return { response, body: await response.json(), env: fullEnv, mails };
  } finally {
    globalThis.fetch = realFetch;
  }
}

// --- the happy path ---------------------------------------------------------

test('a paid Handled checkout mints exactly one token and mails the link', async () => {
  const mails = [];
  const { body, env } = await call(checkoutEvent(), {
    env: { HANDLED_SHEET_URL: 'https://script.google.com/fake' },
    mails,
  });

  assert.equal(body.ok, true);
  assert.equal(body.issued, true);

  const records = [...env.HANDLED_BUCKET.store.keys()].filter((k) => k.endsWith('record.json'));
  assert.equal(records.length, 1, 'exactly one intake record');

  assert.equal(mails.length, 1);
  assert.equal(mails[0].body.kind, 'handled-paid');
  assert.equal(mails[0].body.email, 'ray@acmeplumbing.com');
  assert.equal(mails[0].body.amount, '$300');
  assert.match(mails[0].body.url, /^https:\/\/shanegring\.com\/handled-intake#t=.+/);
});

// --- refusing ---------------------------------------------------------------

test('a forged signature mints nothing', async () => {
  const { response, env } = await call(checkoutEvent(), { secret: 'whsec_wrong' });
  assert.equal(response.status, 400);
  assert.equal(env.HANDLED_BUCKET.store.size, 0);
});

test('a missing signature header mints nothing', async () => {
  const env = { HANDLED_BUCKET: fakeBucket(), STRIPE_WEBHOOK_SECRET: SECRET, HANDLED_PAYMENT_LINK: PLINK };
  const response = await onRequestPost({
    request: new Request('https://shanegring.com/api/stripe-handled', {
      method: 'POST',
      body: checkoutEvent(),
    }),
    env,
    waitUntil: () => {},
  });
  assert.equal(response.status, 400);
  assert.equal(env.HANDLED_BUCKET.store.size, 0);
});

test('a correctly signed but stale request is refused as a replay', async () => {
  const stale = Math.floor(Date.now() / 1000) - 3600;
  const { response, env } = await call(checkoutEvent(), { timestamp: stale });
  assert.equal(response.status, 400);
  assert.equal(env.HANDLED_BUCKET.store.size, 0);
});

test('without a webhook secret the route is closed, not open', async () => {
  const { response } = await call(checkoutEvent(), { env: { STRIPE_WEBHOOK_SECRET: '' } });
  assert.equal(response.status, 503);
});

// --- filtering --------------------------------------------------------------

test('a different payment link mints nothing but still returns 200', async () => {
  const { response, body, env } = await call(checkoutEvent({ paymentLink: 'plink_HourBlock' }));
  assert.equal(response.status, 200, 'a 200 so Stripe does not retry an event we meant to ignore');
  assert.match(body.ignored, /payment_link/);
  assert.equal(env.HANDLED_BUCKET.store.size, 0);
});

test('an unset allowlist mints nothing — it does not fall back to every purchase', async () => {
  const { body, env } = await call(checkoutEvent(), { env: { HANDLED_PAYMENT_LINK: '' } });
  assert.equal(body.issued, undefined);
  assert.equal(env.HANDLED_BUCKET.store.size, 0);
});

test('an unrelated event type is ignored', async () => {
  const other = JSON.stringify({ id: 'evt_2', type: 'invoice.paid', created: Math.floor(Date.now() / 1000) });
  const { response, body } = await call(other);
  assert.equal(response.status, 200);
  assert.match(body.ignored, /invoice\.paid/);
});

// --- replay -----------------------------------------------------------------

test('Stripe redelivering the same event does not mint a second token', async () => {
  const bucket = fakeBucket();
  const body = checkoutEvent({ id: 'evt_same' });

  const first = await call(body, { env: { HANDLED_BUCKET: bucket } });
  assert.equal(first.body.issued, true);

  const second = await call(body, { env: { HANDLED_BUCKET: bucket } });
  assert.equal(second.body.issued, undefined);
  assert.equal(second.body.ignored, 'already handled');

  const records = [...bucket.store.keys()].filter((k) => k.endsWith('record.json'));
  assert.equal(records.length, 1, 'still exactly one intake record after the replay');
});
