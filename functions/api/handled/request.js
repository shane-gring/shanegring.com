/**
 * Handled — ask for a build, get an intake link.  POST /api/handled/request
 *
 * The public front door behind the /handled/first-pass pages. Somebody gives an
 * email (and their current site, if they have one) and gets an intake link of
 * their own, straight away, with no payment. Name and business are optional:
 * the pages stopped asking for them to keep the form short, and the intake asks
 * for the business itself. This is the "build it first, buy it once you're happy" campaign:
 * Shane builds from the intake, sends the draft, and the checkout link comes
 * with it.
 *
 * It mints with exactly the machinery issue.js and stripe-handled.js use, so
 * the link and the intake behind it are identical to a paid client's. What
 * differs is on the record: `source: 'request'` plus what they typed here,
 * which the brief Shane gets on submit reads back as "not paid yet".
 *
 * Unlike those two routes this one has no secret in front of it, so it is the
 * one place a stranger can create intake records (and, through them, upload
 * space). The guards, in order:
 *
 *   1. A honeypot field. Filled means a bot; it gets a success-shaped reply
 *      with no link, so a filled trap reveals nothing.
 *   2. Per-IP hourly limit and a site-wide daily cap, in SCAN_KV (the same
 *      namespace the scan and newsletter signup already use, under its own
 *      prefix). A real business asks once; a cap of a few dozen a day is far
 *      above anything a campaign will send and far below anything that hurts.
 *   3. Everything uploaded later still goes through the intake's own per-file
 *      limits, the same as for a paying client.
 *
 * No KV bound means no limit — the same fail-open choice subscribe.js and the
 * scan make, so a missing binding never turns real people away. SCAN_KV is
 * bound in production; the log line reads `limited=false` if it ever is not.
 *
 * The link comes back in the response and the page sends them straight into
 * the intake. The email (kind 'handled-request' to the Apps Script) is their
 * way back in, not their way in: if the Apps Script is behind or down, the
 * person still lands in the form, and the log line below carries the link.
 *
 * Bindings:
 *   HANDLED_BUCKET           R2      required
 *   SCAN_KV                  KV      rate limiting; absent = no limit
 *   HANDLED_SHEET_URL        var     Apps Script web app; absent = no email
 *   HANDLED_REQUEST_HOURLY   var     per-IP requests per hour (default 5)
 *   HANDLED_REQUEST_DAILY    var     site-wide requests per day (default 40)
 *   ATTIO_API_KEY            secret  lead capture; absent = skipped
 */

import { mintToken, newRecord, writeRecord, json, DEFAULT_TTL_DAYS } from '../../lib/handled-store.js';
import { attioCapture } from '../../lib/attio.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_IP_HOURLY = 5;
const DEFAULT_DAILY = 40;
const KV_PREFIX = 'hreq';

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.HANDLED_BUCKET) {
    return json({ error: 'This isn’t set up yet. Email shane@shanegring.com and I’ll send your link.' }, 503);
  }

  let body;
  try {
    body = (await request.json()) || {};
  } catch {
    return json({ error: 'Send your email.' }, 400);
  }

  // Honeypot. The same shape a person gets, minus the link.
  if (typeof body.company === 'string' && body.company.trim() !== '') {
    return json({ ok: true });
  }

  const name = clean(body.name);
  const email = clean(body.email).toLowerCase();
  const business = clean(body.business);
  const website = clean(body.website);

  if (!EMAIL_RE.test(email)) return json({ error: 'That email doesn’t look right.' }, 400);

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const gate = await rateLimit(env, ip);
  if (gate.capped) {
    return json({ error: 'A lot of people asked today. Email shane@shanegring.com and I’ll send your link myself.' }, 429);
  }
  if (gate.rateLimited) {
    return json({ error: 'That’s a few requests from here already. Give it an hour, or email shane@shanegring.com.' }, 429);
  }

  // Just the first word, the same as the Stripe path: a company name in the
  // name field would otherwise greet them as their own business.
  const firstName = name.split(/\s+/)[0] || '';
  // Whatever best names who asked: the business, else their site, else the
  // email, which is always there.
  const who = business || website || email;
  const label = `${who}${name ? ` — ${name}` : ''} (requested)`.slice(0, 200);

  const record = newRecord({ label, firstName, ttlDays: DEFAULT_TTL_DAYS });
  record.source = 'request';
  record.request = {
    name,
    email,
    business,
    website,
    page: clean(body.page).replace(/[^\w/.-]/g, '').slice(0, 120),
    campaign: utm(body.utm),
    requestedAt: record.issuedAt,
  };

  const token = mintToken();
  await writeRecord(env, token, record);
  await count(env, gate);

  const url = `${new URL(request.url).origin}/handled-intake#t=${token}`;

  // The only durable copy of the link outside their browser and their inbox.
  console.log(`handled-request: issued for ${label} <${email}> limited=${Boolean(gate.ipKey)} — ${url}`);

  if (env.HANDLED_SHEET_URL) {
    context.waitUntil(
      fetch(env.HANDLED_SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'handled-request',
          name,
          email,
          business,
          website,
          page: record.request.page,
          url,
          campaign: record.request.campaign,
          requestedAt: record.issuedAt,
          expiresAt: record.expiresAt,
        }),
      }).catch((e) => console.log('handled-request: mail failed: ' + e.message)),
    );
  }

  context.waitUntil(
    attioCapture(env, {
      email,
      name,
      stage: 'New',
      source: 'Website',
      nextActionDays: 1,
      noteTitle: `Handled first pass requested — ${who}`,
      noteContent:
        `Asked for a free first pass at ${record.request.page || '/handled/first-pass'} (${record.issuedAt}). Not paid: ` +
        `the intake comes first, the checkout link goes out with the draft.\n\n` +
        (business ? `Business: **${business}**\n` : '') +
        (website ? `Current site: ${website}\n` : '') +
        (record.request.campaign ? `Campaign: ${record.request.campaign}\n` : ''),
    }).catch((e) => console.log('handled-request: attio failed: ' + e)),
  );

  return json({ ok: true, url });
}

function clean(v) {
  return String(v || '').trim().slice(0, 200);
}

// utm_source / utm_campaign / utm_content as one readable string, from what
// the page saw in its own query string. Optional and never trusted for more
// than a label.
function utm(v) {
  if (!v || typeof v !== 'object') return '';
  return ['source', 'campaign', 'content']
    .map((k) => clean(v[k]).replace(/[^\w.-]/g, '').slice(0, 60))
    .filter(Boolean)
    .join(' / ');
}

async function rateLimit(env, ip) {
  if (!env.SCAN_KV) return { ok: true };
  try {
    const now = new Date().toISOString(); // 2026-10-15T14:…
    const ipKey = `${KV_PREFIX}:ip:${ip}:${now.slice(0, 13)}`;
    const dayKey = `${KV_PREFIX}:day:${now.slice(0, 10)}`;
    const [ipVal, dayVal] = await Promise.all([env.SCAN_KV.get(ipKey), env.SCAN_KV.get(dayKey)]);
    const ipN = parseInt(ipVal, 10) || 0;
    const dayN = parseInt(dayVal, 10) || 0;
    if (dayN >= (parseInt(env.HANDLED_REQUEST_DAILY, 10) || DEFAULT_DAILY)) return { capped: true };
    if (ipN >= (parseInt(env.HANDLED_REQUEST_HOURLY, 10) || DEFAULT_IP_HOURLY)) return { rateLimited: true };
    return { ok: true, ipKey, dayKey, ipN, dayN };
  } catch (e) {
    console.log('handled-request: KV check failed, failing open: ' + e);
    return { ok: true };
  }
}

async function count(env, gate) {
  if (!env.SCAN_KV || !gate.ipKey) return;
  try {
    await Promise.all([
      env.SCAN_KV.put(gate.ipKey, String(gate.ipN + 1), { expirationTtl: 7200 }),
      env.SCAN_KV.put(gate.dayKey, String(gate.dayN + 1), { expirationTtl: 2 * 86400 }),
    ]);
  } catch (e) {
    console.log('handled-request: KV write failed: ' + e);
  }
}
