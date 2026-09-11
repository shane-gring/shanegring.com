/**
 * Handled intake — take a file back off.  POST /api/handled/detach
 *
 * Body: { questionId, key }
 *
 * Removes the reference from the record. The object itself stays in the bucket:
 * storage is cheap, and a delete that raced an in-flight read would lose
 * something a client cannot re-create. Unreferenced objects can be swept later
 * against the records, which is a safe job to run offline.
 */

import { questionById, RECORDING_FIELD } from '../../../assets/handled/questions.js';
import { updateRecord, json } from '../../lib/handled-store.js';

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Could not read that request.' }, 400);
  }

  const { questionId, key } = body || {};
  const isRecording = questionId === RECORDING_FIELD;
  if (!isRecording && !questionById(questionId)) return json({ error: 'Unknown field.' }, 400);

  const out = await updateRecord(context, (record) => {
    const before = record.uploads[questionId] || [];
    record.uploads[questionId] = before.filter((f) => f.key !== key);

    // Dropping the recording drops its transcript with it, so the review screen
    // can never show text from audio that is no longer attached.
    if (isRecording && !record.uploads[questionId].length) record.transcript = null;

    record.updatedAt = new Date().toISOString();
    return record.uploads[questionId].length;
  });
  if (out.response) return out.response;

  return json({ ok: true, remaining: out.value });
}
