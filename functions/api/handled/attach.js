/**
 * Handled intake — file it once it has landed.  POST /api/handled/attach
 *
 * Body: { questionId, key, name, size, type, durationSec? }
 *
 * The browser calls this after its PUT succeeds. Keeping the record write
 * separate from the byte transfer means a client can lose a connection
 * mid-upload without corrupting anything: either the object made it and this
 * call records it, or it didn't and nothing changed.
 *
 * A recording also gets transcribed here, while the client is still on the page
 * and can be told if it didn't work.
 */

import { questionById, RECORDING_FIELD, sectionById } from '../../../assets/handled/questions.js';
import { authenticate, updateRecord, json } from '../../lib/handled-store.js';
import { signDownload } from '../../lib/handled-uploads.js';
import { transcribe, STATUS_COPY } from '../../lib/handled-transcribe.js';

export async function onRequestPost(context) {
  // Validated up front, outside the retry loop: none of it depends on the
  // record, and the transcription hop must not run twice if a write conflicts.
  const auth = await authenticate(context);
  if (auth.response) return auth.response;

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Could not read that request.' }, 400);
  }

  const { questionId, key, name, size, type, durationSec } = body || {};
  const isRecording = questionId === RECORDING_FIELD;
  const q = isRecording ? { id: RECORDING_FIELD, type: 'file' } : questionById(questionId);
  if (!q) return json({ error: 'Unknown field.' }, 400);

  // Only ever a key we minted, under this client's own prefix.
  if (typeof key !== 'string' || !key.startsWith(`clients/${auth.prefix}/uploads/`)) {
    return json({ error: 'Not your file.' }, 403);
  }

  // Trust the bucket, not the browser, for what actually arrived.
  const head = await context.env.HANDLED_BUCKET.head(key);
  if (!head) return json({ error: 'That upload didn’t arrive. Try again.' }, 409);

  const entry = {
    key,
    name: String(name || 'file').slice(0, 200),
    size: head.size ?? size ?? 0,
    type: String(type || '').slice(0, 120),
    uploadedAt: new Date().toISOString(),
  };
  if (Number.isFinite(durationSec)) entry.durationSec = Math.round(durationSec);

  let transcript = null;
  if (isRecording) {
    const section = sectionById('business');
    transcript = await transcribe(context.env, key, {
      businessName: auth.record.answers?.business_name || '',
      prompts: (section?.questions || []).map((p) => p.label),
    });
  }

  const out = await updateRecord(context, (record) => {
    // Single-file fields replace; multi-file fields append. Replacing means the
    // old object is now unreferenced — it is left in the bucket rather than
    // deleted, because a failed re-upload that also destroyed the previous file
    // would be the worst possible outcome for someone who has paid.
    const existing = record.uploads[q.id] || [];
    record.uploads[q.id] = q.type === 'files' ? [...existing, entry] : [entry];
    record.updatedAt = entry.uploadedAt;
    if (isRecording) record.transcript = transcript;
  });
  if (out.response) return out.response;

  return json({
    ok: true,
    file: { ...entry, url: await signDownload(context.env, key, { ttlDays: 2, name: entry.name }) },
    transcript: transcript && {
      status: transcript.status,
      text: transcript.text,
      words: transcript.words,
      stub: Boolean(transcript.stub),
      // A reason code is for the log; the client gets a sentence.
      message: transcript.status === 'ok' ? null : STATUS_COPY[transcript.reason] || STATUS_COPY.model_error,
    },
  });
}
