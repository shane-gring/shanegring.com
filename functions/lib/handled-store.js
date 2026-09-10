/**
 * Handled intake — token handling and the record store.
 *
 * Storage is R2 (binding HANDLED_BUCKET). One JSON object per client, at a
 * prefix derived from the token, with that client's uploads underneath it:
 *
 *   clients/<sha256(token)>/record.json
 *   clients/<sha256(token)>/uploads/<uuid>.<ext>
 *
 * Why R2 and not KV: the whole intake rests on "close the tab, come back,
 * everything is still there." KV is eventually consistent, so a client who
 * saves and immediately reloads can be served a stale draft — the exact
 * failure the design is meant to make impossible. R2 is strongly consistent
 * for read-after-write on a single key, which is all this needs.
 *
 * Why the prefix is a HASH of the token and not the token: the raw token is a
 * live credential for 30+ days. Hashing it means the bucket never holds a
 * working link, so a dump of object keys grants nobody access. The token
 * exists only in the client's email and their browser's URL fragment.
 */

const PREFIX = 'clients';
const RECORD = 'record.json';

// 32 bytes → 43 URL-safe characters. Not sequential, not guessable, and short
// enough to survive being pasted into a phone browser without wrapping.
const TOKEN_BYTES = 32;

export const DEFAULT_TTL_DAYS = 45; // brief requires "at least 30"

// --- token ----------------------------------------------------------------

export function mintToken() {
  const raw = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(raw);
  return base64url(raw);
}

export async function tokenPrefix(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return hex(new Uint8Array(digest));
}

// Shape check only — cheap rejection of obvious junk before touching storage.
// A well-formed token that isn't in the bucket still fails at the lookup.
export function looksLikeToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(token);
}

// --- record ---------------------------------------------------------------

export function newRecord({ label = '', ttlDays = DEFAULT_TTL_DAYS } = {}) {
  const now = new Date();
  const expires = new Date(now.getTime() + ttlDays * 86400_000);
  return {
    version: 1,
    label,                       // internal only: who we issued this to
    status: 'draft',
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    updatedAt: now.toISOString(),
    submittedAt: null,
    answers: {},                 // everything the client sees on the page
    operations: {},              // Section 3, filed separately for the monthly program
    uploads: {},                 // questionId -> [{key, name, size, type, uploadedAt}]
    template: null,
  };
}

export function isExpired(record, now = Date.now()) {
  const t = Date.parse(record?.expiresAt || '');
  return Number.isFinite(t) && t < now;
}

export async function readRecord(env, token) {
  const obj = await env.HANDLED_BUCKET.get(recordKey(await tokenPrefix(token)));
  if (!obj) return null;
  try {
    return JSON.parse(await obj.text());
  } catch {
    return null;
  }
}

export async function writeRecord(env, token, record) {
  await env.HANDLED_BUCKET.put(recordKey(await tokenPrefix(token)), JSON.stringify(record, null, 2), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
  return record;
}

export const recordKey = (prefix) => `${PREFIX}/${prefix}/${RECORD}`;
export const uploadKey = (prefix, filename) => `${PREFIX}/${prefix}/uploads/${filename}`;

// --- request plumbing -----------------------------------------------------

export const TOKEN_HEADER = 'X-Handled-Token';

export function tokenFromRequest(request) {
  return request.headers.get(TOKEN_HEADER) || '';
}

/**
 * Resolve a request to a usable record, or to the Response that should be
 * returned instead. Every intake endpoint starts with this, so the rules for
 * "which links work" live in exactly one place.
 *
 * Returns { record, prefix } on success, or { response } on refusal.
 */
export async function authenticate(context, { allowSubmitted = false } = {}) {
  const { request, env } = context;

  if (!env.HANDLED_BUCKET) {
    return { response: json({ error: 'The intake isn’t configured yet.' }, 503) };
  }

  const token = tokenFromRequest(request);
  if (!looksLikeToken(token)) {
    return { response: json({ error: 'invalid_link' }, 401) };
  }

  const record = await readRecord(env, token);
  if (!record) {
    return { response: json({ error: 'invalid_link' }, 401) };
  }
  if (isExpired(record)) {
    return { response: json({ error: 'expired_link' }, 410) };
  }
  if (record.status === 'submitted' && !allowSubmitted) {
    // The link keeps working after submission, but only to look back at what
    // was sent. Silent edits to a brief Shane may already be building from
    // would be worse than no access at all.
    return { response: json({ error: 'already_submitted' }, 409) };
  }

  return { record, prefix: await tokenPrefix(token), token };
}

// --- shared helpers -------------------------------------------------------

export function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // A draft is a client's own data behind a credential. Nothing about it
      // should sit in a shared cache.
      'Cache-Control': 'no-store',
    },
  });
}

// Length-independent comparison, so a wrong admin secret can't be narrowed
// down by timing the response.
export function secretsMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
