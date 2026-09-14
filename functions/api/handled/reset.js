/**
 * Handled intake — wipe a record back to a blank draft.  POST /api/handled/reset
 *
 * Same link, same token, empty form. This exists for two real situations: a
 * demo link that needs running again, and a client who asks to start over
 * after submitting. Issuing a fresh token would work for the second but not
 * the first, because the old URL has usually already been sent to someone.
 *
 * DESTRUCTIVE. It clears a submission, and a submitted intake is a client's
 * finished brief. It requires the admin secret AND the raw token — knowing one
 * is not enough — and it refuses to touch a record that does not already
 * exist. Uploaded files are left in the bucket rather than deleted, same as
 * everywhere else here: an orphaned object costs nothing, and a delete that
 * raced a read would destroy something a client cannot re-create.
 */

import {
  newRecord, readRecord, writeRecord, looksLikeToken,
  secretsMatch, json, DEFAULT_TTL_DAYS,
} from '../../lib/handled-store.js';

const ADMIN_HEADER = 'X-Handled-Admin';

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.HANDLED_ADMIN_SECRET) return json({ error: 'Reset isn’t configured.' }, 503);
  if (!secretsMatch(request.headers.get(ADMIN_HEADER) || '', env.HANDLED_ADMIN_SECRET)) {
    return json({ error: 'Not authorised.' }, 401);
  }
  if (!env.HANDLED_BUCKET) return json({ error: 'The intake isn’t configured yet.' }, 503);

  let body = {};
  try {
    body = (await request.json()) || {};
  } catch {
    return json({ error: 'Could not read that request.' }, 400);
  }

  const token = String(body.token || '');
  if (!looksLikeToken(token)) return json({ error: 'That is not a token.' }, 400);

  const found = await readRecord(env, token);
  if (!found) return json({ error: 'No record for that token.' }, 404);

  // Keep who it was issued to and when it expires — this is the same link going
  // back to the start, not a new one.
  const fresh = newRecord({ label: found.record.label || '', ttlDays: DEFAULT_TTL_DAYS });
  fresh.issuedAt = found.record.issuedAt || fresh.issuedAt;
  fresh.expiresAt = found.record.expiresAt || fresh.expiresAt;

  await writeRecord(env, token, fresh);

  return json({
    ok: true,
    label: fresh.label,
    was: found.record.status,
    expiresAt: fresh.expiresAt,
  });
}
