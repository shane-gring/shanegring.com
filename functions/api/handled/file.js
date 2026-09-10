/**
 * Handled intake — serve one uploaded file.  GET /api/handled/file?key=&exp=&sig=
 *
 * Shane opens these from an email, possibly weeks later, with no session and no
 * credentials — so the link carries its own authority: an HMAC over the key and
 * an expiry. Editing either invalidates it, and it grants exactly one object.
 *
 * Signed by us rather than presigned by S3 so the same links work in local
 * review, and so there is one secret to rotate instead of an S3 key pair.
 */

import { json } from '../../lib/handled-store.js';
import { verifyDownload } from '../../lib/handled-uploads.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const p = new URL(request.url).searchParams;
  const key = p.get('key');

  if (!(await verifyDownload(env, key, p.get('exp'), p.get('sig')))) {
    return new Response('This download link has expired or is not valid.\n', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  if (!env.HANDLED_BUCKET) return json({ error: 'Storage isn’t configured.' }, 503);

  const obj = await env.HANDLED_BUCKET.get(key);
  if (!obj) return new Response('That file is no longer here.\n', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('Cache-Control', 'private, max-age=3600');
  // Keys are opaque by design, so without this every file Shane opens saves as
  // "logo-<uuid>.png". The name is unsigned, so strip anything that could break
  // out of the header or the filename.
  const raw = new URL(request.url).searchParams.get('name') || '';
  const name = raw.replace(/[^\w .()\-]/g, '').slice(0, 120).trim();
  if (name) headers.set('Content-Disposition', `inline; filename="${name}"`);

  return new Response(obj.body, { headers });
}
