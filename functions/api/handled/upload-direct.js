/**
 * Handled intake — local-only upload sink.  PUT /api/handled/upload-direct?key=
 *
 * The brief says not to route file bytes through a serverless function, and in
 * production nothing does — see upload.js. This exists so the upload flow can
 * be reviewed on a laptop at all: wrangler's R2 simulator exposes no S3
 * endpoint, so there is nothing to presign against locally.
 *
 * It refuses to run the moment real R2 credentials are present, so it cannot
 * quietly become the production path. It is also bounded by the Worker request
 * body limit (100 MB), which is exactly the limitation presigning exists to
 * avoid — fine for a 2.4 MB recording, not for a large upload.
 */

import { authenticate, json } from '../../lib/handled-store.js';
import { canPresign } from '../../lib/handled-uploads.js';

export async function onRequestPut(context) {
  const { request, env } = context;

  if (canPresign(env)) {
    return json({ error: 'Direct upload is disabled when R2 credentials are configured.' }, 403);
  }

  const auth = await authenticate(context);
  if (auth.response) return auth.response;

  const key = new URL(request.url).searchParams.get('key') || '';
  // A key is only ever handed out by upload.js, and always under this client's
  // own prefix. Anything else is someone editing the URL.
  if (!key.startsWith(`clients/${auth.prefix}/uploads/`)) {
    return json({ error: 'Not your file.' }, 403);
  }

  await env.HANDLED_BUCKET.put(key, request.body, {
    httpMetadata: { contentType: request.headers.get('Content-Type') || 'application/octet-stream' },
  });

  return json({ ok: true, key });
}
