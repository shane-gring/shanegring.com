/**
 * Handled — mint an intake link when someone pays.  POST /api/stripe-handled
 *
 * Stripe calls this on checkout.session.completed. If the session came from the
 * Handled payment link, it mints an intake token and emails Shane the link plus
 * who bought it. Shane sends it on. The client is never emailed from here.
 *
 * This is the one piece that knows about Stripe. issue.js deliberately does not,
 * and that stays true: this route calls the same mintToken/writeRecord the
 * command line does, so a paying client and a waived friend still get identical
 * links by identical machinery. Nothing downstream can tell them apart.
 *
 * Failing closed is the rule throughout. A route that mints credentials off an
 * inbound request refuses to run unless every guard is configured — no secret,
 * no payment-link allowlist, no bucket, no token. A missing HANDLED_SHEET_URL is
 * the one exception: the token is already minted and durable by then, so the
 * mail is best-effort and the link is recoverable from the log line.
 *
 * Bindings:
 *   HANDLED_BUCKET          R2      required
 *   STRIPE_WEBHOOK_SECRET   secret  required; whsec_… from the Stripe endpoint
 *   HANDLED_PAYMENT_LINK    var     required; plink_… id(s), comma-separated
 *   HANDLED_SHEET_URL       var     Apps Script web app; absent = no email
 */

import { mintToken, newRecord, writeRecord, json, DEFAULT_TTL_DAYS } from '../lib/handled-store.js';

// Stripe replays a webhook for up to three days when it does not get a 2xx, and
// sends the same event twice often enough that "probably fine" is not good
// enough for something that mints a credential. A marker object per event id,
// written before the token, makes a replay a no-op. R2 is strongly consistent
// on a single key, so the check is real rather than best-effort.
const SEEN_PREFIX = 'stripe/events';

// Stripe's own tolerance. Anything older is a replay of a captured request
// rather than a live delivery.
const TOLERANCE_SECONDS = 300;

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'Stripe webhook isn’t configured.' }, 503);
  if (!env.HANDLED_BUCKET) return json({ error: 'The intake isn’t configured yet.' }, 503);

  // Read the body as text exactly once. Stripe signs the raw bytes, so parsing
  // first and re-serialising would change them and fail every signature.
  const raw = await request.text();

  if (!(await validSignature(env.STRIPE_WEBHOOK_SECRET, raw, request.headers.get('Stripe-Signature')))) {
    return json({ error: 'Bad signature.' }, 400);
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: 'Could not read that request.' }, 400);
  }

  // Everything below here is a 200. Stripe retries non-2xx, and an event we
  // deliberately ignore is handled, not failed — returning 400 for those would
  // earn the endpoint a disabled-for-failures email from Stripe.
  if (event.type !== 'checkout.session.completed') {
    return json({ ok: true, ignored: `type ${event.type}` });
  }

  const session = event.data?.object || {};

  const allowed = String(env.HANDLED_PAYMENT_LINK || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // No allowlist means every purchase on the site — hour blocks, the CMS add-on
  // — would mint an intake link. Refuse rather than guess.
  if (!allowed.length) {
    console.log('stripe-handled: HANDLED_PAYMENT_LINK is unset; minted nothing');
    return json({ ok: true, ignored: 'no payment-link allowlist' });
  }
  if (!allowed.includes(String(session.payment_link || ''))) {
    return json({ ok: true, ignored: `payment_link ${session.payment_link || 'none'}` });
  }

  const eventKey = `${SEEN_PREFIX}/${event.id}`;
  if (await env.HANDLED_BUCKET.head(eventKey)) {
    return json({ ok: true, ignored: 'already handled' });
  }

  const who = session.customer_details || {};
  const name = String(who.name || '').slice(0, 200);
  const email = String(who.email || '').slice(0, 200);

  // The label is what Shane sees in the brief and on the record. Their name is
  // the most useful thing we have at this point; the business name only arrives
  // once they fill the form in.
  const label = name || email || 'Stripe purchase';

  const token = mintToken();
  await writeRecord(env, token, newRecord({ label, ttlDays: DEFAULT_TTL_DAYS }));

  // Written after the token so a crash between the two replays cleanly: the
  // marker's absence means the work did not finish, and a retry redoes it.
  await env.HANDLED_BUCKET.put(
    eventKey,
    JSON.stringify({ at: new Date().toISOString(), label, email, session: session.id }),
    { httpMetadata: { contentType: 'application/json' } },
  );

  const url = `${new URL(request.url).origin}/handled-intake#t=${token}`;

  // The token exists and is durable from here on. If the mail fails, this line
  // is how the link is recovered — it cannot be read back out of storage.
  console.log(`stripe-handled: issued for ${label} <${email}> — ${url}`);

  if (env.HANDLED_SHEET_URL) {
    context.waitUntil(
      fetch(env.HANDLED_SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'handled-paid',
          name,
          email,
          label,
          url,
          amount: formatAmount(session.amount_total, session.currency),
          paidAt: new Date((event.created || 0) * 1000).toISOString(),
          session: session.id,
        }),
      }).catch((e) => console.log('stripe-handled: mail failed: ' + e.message)),
    );
  }

  return json({ ok: true, issued: true });
}

/**
 * Stripe-Signature is `t=<unix>,v1=<hex>,v1=<hex>…` — more than one v1 during a
 * secret rotation, so every one of them gets a chance to match.
 */
async function validSignature(secret, rawBody, header) {
  if (!header) return false;

  let timestamp = '';
  const signatures = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=');
    if (k?.trim() === 't') timestamp = v?.trim() || '';
    if (k?.trim() === 'v1' && v) signatures.push(v.trim());
  }
  if (!timestamp || !signatures.length) return false;

  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!Number.isFinite(age) || Math.abs(age) > TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');

  return signatures.some((given) => timingSafeEqual(expected, given));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function formatAmount(amount, currency) {
  if (!Number.isFinite(amount)) return '';
  const sym = { usd: '$', gbp: '£', eur: '€' }[String(currency || '').toLowerCase()] || '';
  return `${sym}${(amount / 100).toFixed(2).replace(/\.00$/, '')}`;
}
