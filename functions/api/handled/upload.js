/**
 * Handled intake — ask for somewhere to put a file.  POST /api/handled/upload
 *
 * Body: { questionId, name, size, type, group }
 * Returns: { key, url, method, headers, direct }
 *
 * The browser then PUTs the bytes to `url` itself. Two shapes come back:
 *
 *   production  a presigned R2 URL. Bytes go browser -> R2 and never touch a
 *               Worker, which is the only way a file over 100 MB can work.
 *   local       a URL on this Worker (see upload-direct.js), because wrangler's
 *               R2 simulator has no S3 endpoint to presign against. Same client
 *               code either way — only the URL differs.
 *
 * The size and type rules come from assets/handled/uploads.js, the same file
 * the browser checks against. The browser's check is a courtesy that fails
 * fast; this one is the one that counts, because the other runs on a machine
 * we do not control.
 */

import { GROUPS, validateUpload } from '../../../assets/handled/uploads.js';
import { questionById, RECORDING_FIELD } from '../../../assets/handled/questions.js';
import { authenticate, json } from '../../lib/handled-store.js';
import { canPresign, presignPut, makeKey } from '../../lib/handled-uploads.js';

export async function onRequestPost(context) {
  const auth = await authenticate(context);
  if (auth.response) return auth.response;

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Could not read that request.' }, 400);
  }

  const { questionId, name, size, type } = body || {};

  // The recording is not a question (see RECORDING_FIELD), so it is matched
  // first and always belongs to the audio group.
  const isRecording = questionId === RECORDING_FIELD;
  const q = isRecording ? { id: RECORDING_FIELD, accept: 'audio' } : questionById(questionId);
  if (!q) return json({ error: 'Unknown field.' }, 400);

  // The group comes from config, never from the client — otherwise anyone could
  // claim a 3 MB executable is an audio file and pick their own size limit.
  const group = q.accept || 'image';
  if (!GROUPS[group]) return json({ error: 'Unknown field.' }, 400);

  const problem = validateUpload(group, { name, size, type });
  if (problem) return json({ error: problem }, 422);

  const key = makeKey(auth.prefix, q.id, name);

  if (canPresign(context.env)) {
    return json({
      key,
      url: await presignPut(context.env, key, { expiresIn: 3600 }),
      method: 'PUT',
      headers: {},
      direct: false,
    });
  }

  return json({
    key,
    url: `/api/handled/upload-direct?key=${encodeURIComponent(key)}`,
    method: 'PUT',
    headers: { 'X-Handled-Token': '' }, // filled in by the client
    direct: true,
  });
}
