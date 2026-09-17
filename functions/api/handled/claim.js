/**
 * GET /api/handled/claim?session=cs_live_…
 *
 * Hands a buyer the intake token for the checkout they just completed, so
 * Stripe can send them straight to the form instead of back to the sales
 * page. Stripe substitutes {CHECKOUT_SESSION_ID} into the success URL; this
 * exchanges that id for the token the webhook minted.
 *
 * The pointer is written by functions/api/stripe-handled.js. It only exists
 * once the webhook has run, and the redirect regularly beats the webhook by a
 * second or two — so "not there yet" is a 404 with `retry: true`, which the
 * intake page polls on, rather than an error.
 *
 * The session id is the credential here. It is long, unguessable and known
 * only to the buyer's browser and Stripe, which is the same footing as the
 * token link itself. Nothing is returned for an id that never bought.
 */

import { json } from '../../lib/handled-store.js';

// Stripe's ids are cs_live_… / cs_test_… followed by base62. Bounded so a
// junk query can never become a bucket lookup of arbitrary length.
const SESSION_RE = /^cs_(live|test)_[A-Za-z0-9]{10,200}$/;

export const SESSION_PREFIX = 'stripe/sessions';

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.HANDLED_BUCKET) {
    return json({ error: 'not_configured' }, 503);
  }

  const id = new URL(request.url).searchParams.get('session') || '';
  if (!SESSION_RE.test(id)) {
    return json({ error: 'bad_session' }, 400);
  }

  const object = await env.HANDLED_BUCKET.get(`${SESSION_PREFIX}/${id}`);
  if (!object) {
    // Either the webhook has not landed yet or this id never bought. Both look
    // the same from here on purpose: a caller guessing ids learns nothing.
    return json({ error: 'not_ready', retry: true }, 404);
  }

  const pointer = await object.json().catch(() => null);
  if (!pointer?.token) {
    return json({ error: 'not_ready', retry: true }, 404);
  }

  return json({ token: pointer.token });
}
