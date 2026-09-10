// Cross-checks the SigV4 presigner in functions/lib/handled-uploads.js against
// an independent implementation written from the AWS spec in Python.
//
// This exists because the presigned upload path CANNOT be exercised locally:
// wrangler's R2 simulator has no S3 endpoint to PUT at, so the first time this
// code runs for real would otherwise be against a live bucket. Two independent
// implementations agreeing on the same signature is the next best evidence.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { presignPut, makeKey, signDownload, verifyDownload } from '../functions/lib/handled-uploads.js';

const ENV = {
  R2_ACCOUNT_ID: 'abc123account',
  R2_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
  R2_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  R2_BUCKET: 'handled',
};
const KEY = 'clients/deadbeef/uploads/logo-1234.png';
const WHEN = new Date('2026-09-10T12:55:00Z');

const PY = `
import hashlib, hmac, urllib.parse, sys

access, secret, account, bucket, key, amzdate, expires = sys.argv[1:8]
datestamp = amzdate[:8]
region, service = 'auto', 's3'
host = account + '.r2.cloudflarestorage.com'
uri = '/' + bucket + '/' + '/'.join(urllib.parse.quote(p, safe='') for p in key.split('/'))
scope = '/'.join([datestamp, region, service, 'aws4_request'])

q = {
  'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
  'X-Amz-Credential': access + '/' + scope,
  'X-Amz-Date': amzdate,
  'X-Amz-Expires': expires,
  'X-Amz-SignedHeaders': 'host',
}
canonical_qs = '&'.join(
  urllib.parse.quote(k, safe='-_.~') + '=' + urllib.parse.quote(q[k], safe='-_.~')
  for k in sorted(q)
)
canonical = '\\n'.join(['PUT', uri, canonical_qs, 'host:' + host + '\\n', 'host', 'UNSIGNED-PAYLOAD'])
sts = '\\n'.join(['AWS4-HMAC-SHA256', amzdate, scope, hashlib.sha256(canonical.encode()).hexdigest()])

def sign(k, m): return hmac.new(k, m.encode(), hashlib.sha256).digest()
k = ('AWS4' + secret).encode()
for part in [datestamp, region, service, 'aws4_request']:
    k = sign(k, part)
print(hmac.new(k, sts.encode(), hashlib.sha256).hexdigest())
`;

test('presigned PUT matches an independent SigV4 implementation', async () => {
  const url = await presignPut(ENV, KEY, { expiresIn: 3600, now: WHEN });
  const ours = new URL(url).searchParams.get('X-Amz-Signature');

  const amzDate = WHEN.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const theirs = execFileSync('python3', [
    '-c', PY, ENV.R2_ACCESS_KEY_ID, ENV.R2_SECRET_ACCESS_KEY,
    ENV.R2_ACCOUNT_ID, ENV.R2_BUCKET, KEY, amzDate, '3600',
  ]).toString().trim();

  assert.equal(ours, theirs, 'signatures diverge');
  assert.match(url, /^https:\/\/abc123account\.r2\.cloudflarestorage\.com\/handled\//);
});

test('presigned URL carries every parameter R2 requires', async () => {
  const p = new URL(await presignPut(ENV, KEY, { now: WHEN })).searchParams;
  for (const k of ['X-Amz-Algorithm', 'X-Amz-Credential', 'X-Amz-Date', 'X-Amz-Expires', 'X-Amz-SignedHeaders', 'X-Amz-Signature']) {
    assert.ok(p.get(k), `missing ${k}`);
  }
});

test('object keys ignore the filename the client supplied', () => {
  const k = makeKey('deadbeef', 'logo', '../../etc/passwd.png');
  assert.match(k, /^clients\/deadbeef\/uploads\/logo-[0-9a-f-]{36}\.png$/);
  assert.ok(!k.includes('..'), 'traversal survived');
  assert.ok(!k.includes('passwd'), 'client filename survived');
});

test('a download link verifies, and refuses to be edited', async () => {
  const env = { HANDLED_ADMIN_SECRET: 'test-secret' };
  const link = await signDownload(env, KEY, { ttlDays: 60 });
  const p = new URLSearchParams(link.split('?')[1]);

  assert.equal(await verifyDownload(env, p.get('key'), p.get('exp'), p.get('sig')), true);
  // point it at a different object
  assert.equal(await verifyDownload(env, 'clients/other/uploads/x.png', p.get('exp'), p.get('sig')), false);
  // push the expiry out
  assert.equal(await verifyDownload(env, p.get('key'), String(Number(p.get('exp')) + 86400), p.get('sig')), false);
  // already expired
  const stale = Math.floor(Date.now() / 1000) - 10;
  assert.equal(await verifyDownload(env, KEY, String(stale), p.get('sig')), false);
});
