/**
 * Handled intake — upload targets and download links.
 *
 * Two different problems, two different mechanisms:
 *
 * UP (browser -> storage). A presigned S3 PUT straight at R2, so file bytes
 * never pass through a Worker. That is not a preference: Workers cap a request
 * body at 100 MB, and a voice memo off a phone can exceed it. Presigning needs
 * an R2 S3 access key pair, which only exists in production — see devFallback
 * below for how local review works without one.
 *
 * DOWN (Shane -> file). An HMAC-signed link served BY the Worker, not a
 * presigned S3 GET. Shane opens these from an email weeks later with no session
 * and no credentials, so the link itself has to carry the authority. Signing it
 * ourselves means one secret instead of an S3 key pair, an expiry we choose,
 * and links that work identically in local review. Serving a handful of small
 * files outward through a Worker costs nothing; the 100 MB cap is on request
 * bodies, not responses.
 */

const enc = new TextEncoder();

// --- presigned PUT (production) --------------------------------------------

const ALGO = 'AWS4-HMAC-SHA256';
const SERVICE = 's3';
const REGION = 'auto'; // R2 is region-less; SigV4 still requires a value

export function canPresign(env) {
  return Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET);
}

/**
 * A presigned PUT URL for one object. The browser PUTs the bytes directly to
 * the returned URL with no extra headers, so nothing about our credentials
 * reaches the client.
 */
export async function presignPut(env, key, { expiresIn = 3600, now = new Date() } = {}) {
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const canonicalUri = '/' + env.R2_BUCKET + '/' + key.split('/').map(encodeURIComponent).join('/');

  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');   // 20260910T125500Z
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;

  const query = new URLSearchParams({
    'X-Amz-Algorithm': ALGO,
    'X-Amz-Credential': `${env.R2_ACCESS_KEY_ID}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': 'host',
  });
  // SigV4 requires the query string sorted by key. URLSearchParams preserves
  // insertion order, so sort explicitly rather than relying on how it was built.
  query.sort();

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    query.toString(),
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [ALGO, amzDate, scope, await sha256Hex(canonicalRequest)].join('\n');

  const signingKey = await hmacChain(`AWS4${env.R2_SECRET_ACCESS_KEY}`, [dateStamp, REGION, SERVICE, 'aws4_request']);
  const signature = toHex(await hmac(signingKey, stringToSign));

  query.set('X-Amz-Signature', signature);
  return `https://${host}${canonicalUri}?${query.toString()}`;
}

// --- signed download links (both environments) ------------------------------

/**
 * A link Shane can open from an email. Signed over key + expiry so it cannot be
 * edited into a different object or a later date, and scoped to one file.
 */
export async function signDownload(env, key, { ttlDays = 60, name = '' } = {}) {
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 86400;
  const sig = await downloadSignature(env, key, exp);
  const qs = new URLSearchParams({ key, exp: String(exp), sig });
  // The original filename rides on the link rather than in bucket metadata: a
  // presigned PUT would have to sign x-amz-meta-* headers to carry it, and R2
  // cannot add metadata to an object after the fact. It is not covered by the
  // signature, so file.js sanitises it — it only ever decorates the download
  // name and grants nothing.
  if (name) qs.set('name', name.slice(0, 120));
  return `/api/handled/file?${qs.toString()}`;
}

export async function verifyDownload(env, key, exp, sig) {
  if (!key || !exp || !sig) return false;
  if (!env.HANDLED_DOWNLOAD_SECRET && !env.HANDLED_ADMIN_SECRET) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum * 1000 < Date.now()) return false;
  const expected = await downloadSignature(env, key, expNum);
  return timingSafeEqual(expected, sig);
}

async function downloadSignature(env, key, exp) {
  // Falls back to the admin secret so local review works with one secret set.
  // Empty is NOT an acceptable third option: an HMAC keyed on "" is forgeable
  // by anyone, and a deployment with R2 bound but secrets not yet added is a
  // real intermediate state — the setup doc has them at different steps.
  const secret = env.HANDLED_DOWNLOAD_SECRET || env.HANDLED_ADMIN_SECRET;
  if (!secret) throw new Error('no signing secret configured');
  return toHex(await hmac(enc.encode(secret), `${key}:${exp}`)).slice(0, 32);
}

// --- object keys ------------------------------------------------------------

/**
 * Keys are ours, never the client's. A user-supplied filename can collide,
 * traverse, or carry something unpleasant into a URL; the original name is kept
 * as metadata on the record instead, which is all Shane actually needs.
 */
export function makeKey(prefix, questionId, filename) {
  const ext = (/\.([a-z0-9]{1,8})$/i.exec(filename || '')?.[1] || 'bin').toLowerCase();
  const safeQ = String(questionId).replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'file';
  return `clients/${prefix}/uploads/${safeQ}-${crypto.randomUUID()}.${ext}`;
}

// --- crypto helpers ---------------------------------------------------------

async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

async function hmacChain(secret, parts) {
  let key = enc.encode(secret);
  for (const p of parts) key = await hmac(key, p);
  return key;
}

async function sha256Hex(s) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))));
}

const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
