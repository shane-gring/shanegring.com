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
 * Optional `email` and `name` cover a client who pays outside Stripe: given an
 * email, this sends the same 'handled-paid' notification stripe-handled.js
 * sends — the client gets the welcome email with their link, and a row lands
 * on the "Handled paid" sheet — tagged `source: 'manual'` so it reads as
 * off-Stripe rather than conflated with a real Stripe purchase.
 *
 * Bindings:
 *   HANDLED_BUCKET         R2      required
 *   HANDLED_ADMIN_SECRET   secret  required; without it the route is closed
 *   HANDLED_SHEET_URL      var     Apps Script web app; absent = no email
 */

import { mintToken, newRecord, writeRecord, secretsMatch, json, DEFAULT_TTL_DAYS } from '../../lib/handled-store.js';

const ADMIN_HEADER = 'X-Handled-Admin';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const email = String(body.email || '').trim().slice(0, 200);
  if (email && !EMAIL_RE.test(email)) {
    return json({ error: 'That doesn’t look like an email address.' }, 400);
  }
  const name = String(body.name || '').trim().slice(0, 200);
  // Just the first word of what was typed in, the same as the Stripe path —
  // a company name in the name field would greet them as their own business.
  const firstName = name.split(/\s+/)[0] || '';

  const ttlDays = clampTtl(body.ttlDays);
  const token = mintToken();
  const record = newRecord({ label: String(body.label || '').slice(0, 200), firstName, ttlDays });
  await writeRecord(env, token, record);

  const base = new URL(request.url).origin;
  const url = `${base}/handled-intake#t=${token}`;

  // Mirrors the payload stripe-handled.js sends after a real Stripe payment,
  // minus the Stripe-only fields (amount, session), plus `source: 'manual'` so
  // the sheet and Shane's notification can tell the two apart.
  let notified = false;
  if (email && env.HANDLED_SHEET_URL) {
    notified = true;
    context.waitUntil(
      fetch(env.HANDLED_SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'handled-paid',
          name,
          email,
          label: record.label,
          url,
          amount: '',
          paidAt: new Date().toISOString(),
          session: '',
          expiresAt: record.expiresAt,
          source: 'manual',
        }),
      }).catch((e) => console.log('issue: mail failed: ' + e.message)),
    );
  }

  return json({
    ok: true,
    token,
    url,
    label: record.label,
    expiresAt: record.expiresAt,
    notified,
  });
}

function clampTtl(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_TTL_DAYS;
  // Floor of 30 comes straight from the brief; a token issued for less than
  // that would break the promise made in the email.
  return Math.min(365, Math.max(30, Math.round(n)));
}
