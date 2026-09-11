/**
 * Handled intake — issue a token.  POST /api/handled/issue
 *
 * The minimum viable admin surface: one protected endpoint, driven by
 * tools/handled-token.mjs. There is no admin UI, and the brief says to ask
 * before building one.
 *
 * Token issuance is deliberately manual and knows nothing about Stripe. A
 * client who paid and a friend whose fee Shane waived get the same link by the
 * same command — the intake only ever asks whether a token is valid.
 *
 * Bindings:
 *   HANDLED_BUCKET         R2      required
 *   HANDLED_ADMIN_SECRET   secret  required; without it the route is closed
 */

import { mintToken, newRecord, writeRecord, secretsMatch, json, DEFAULT_TTL_DAYS } from '../../lib/handled-store.js';

const ADMIN_HEADER = 'X-Handled-Admin';

export async function onRequestPost(context) {
  const { request, env } = context;

  // No secret configured means no issuing. Failing closed is the only safe
  // default for a route that mints credentials.
  if (!env.HANDLED_ADMIN_SECRET) {
    return json({ error: 'Token issuing isn’t configured.' }, 503);
  }
  if (!secretsMatch(request.headers.get(ADMIN_HEADER) || '', env.HANDLED_ADMIN_SECRET)) {
    return json({ error: 'Not authorised.' }, 401);
  }
  if (!env.HANDLED_BUCKET) {
    return json({ error: 'The intake isn’t configured yet.' }, 503);
  }

  let body = {};
  try {
    body = (await request.json()) || {};
  } catch {
    /* an empty body is fine — label is optional */
  }

  const ttlDays = clampTtl(body.ttlDays);
  const token = mintToken();
  const record = newRecord({ label: String(body.label || '').slice(0, 200), ttlDays });
  await writeRecord(env, token, record);

  const base = new URL(request.url).origin;
  return json({
    ok: true,
    token,
    url: `${base}/handled-intake#t=${token}`,
    label: record.label,
    expiresAt: record.expiresAt,
  });
}

function clampTtl(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_TTL_DAYS;
  // Floor of 30 comes straight from the brief; a token issued for less than
  // that would break the promise made in the email.
  return Math.min(365, Math.max(30, Math.round(n)));
}
