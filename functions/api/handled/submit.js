/**
 * Handled intake — final submission.  POST /api/handled/submit
 *
 * Marks the record submitted, then fans out three ways. All three side effects
 * are best-effort and run after the client already has its answer: a client
 * who has finished a fifteen-minute form must never see an error because a
 * downstream service was slow. The record is the source of truth; the email
 * and the CRM note are derived from it and can be rebuilt from storage.
 *
 *   1. record.json         status + submittedAt (the durable bit)
 *   2. HANDLED_SHEET_URL   Apps Script web app: emails Shane + the client
 *   3. Attio               person + a note carrying the whole brief
 *
 * Bindings:
 *   HANDLED_BUCKET      R2    required
 *   HANDLED_SHEET_URL   var   Apps Script web-app URL; absent = no email
 *   ATTIO_API_KEY       secret (shared with the rest of the site); absent = skipped
 */

import { allQuestions, requiredIds, questionById } from '../../../assets/handled/questions.js';
import { authenticate, writeRecord, json } from '../../lib/handled-store.js';
import { buildSummary, buildNote } from '../../lib/handled-summary.js';
import { attioCapture } from '../../lib/attio.js';

export async function onRequestPost(context) {
  const auth = await authenticate(context); // 409s if already submitted
  if (auth.response) return auth.response;

  const record = auth.record;

  const missing = requiredIds().filter((id) => !hasAnswer(record, id));
  if (missing.length) {
    return json(
      {
        error: 'incomplete',
        missing,
        message: 'A few answers are still needed before this can go.',
      },
      422
    );
  }

  record.status = 'submitted';
  record.submittedAt = new Date().toISOString();
  record.updatedAt = record.submittedAt;
  await writeRecord(context.env, auth.token, record);

  // Everything below is derived. Run it after the response so the client's
  // "Sent" screen never waits on Gmail or Attio.
  const forSummary = { ...record, _prefix: auth.prefix };
  context.waitUntil(notify(context.env, forSummary).catch((e) => console.log('handled-submit: ' + e.message)));

  return json({ ok: true, submittedAt: record.submittedAt });
}

function hasAnswer(record, id) {
  const q = questionById(id);
  if (!q) return true; // a required question that no longer exists can't block a submit
  if (q.type === 'template-picker') return Boolean(record.template);
  const v = record.answers?.[id];
  if (Array.isArray(v)) return v.length > 0;
  return typeof v === 'string' && v.trim() !== '';
}

async function notify(env, record) {
  const summary = buildSummary(record);
  const email = (record.answers?.email || '').trim();
  const business = (record.answers?.business_name || '').trim();

  const tasks = [];

  if (env.HANDLED_SHEET_URL) {
    tasks.push(
      fetch(env.HANDLED_SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'handled-intake',
          business,
          email,
          submittedAt: record.submittedAt,
          template: record.template,
          summary,                 // the pre-rendered text Shane reads
          record,                  // the structured original, for the sheet
        }),
      })
    );
  } else {
    console.log('handled-submit: HANDLED_SHEET_URL not configured; no email sent');
  }

  if (email) {
    tasks.push(
      attioCapture(env, {
        email,
        name: business || undefined,
        source: 'Handled intake',
        // Stage and offer are deliberately not set. The file's own policy is
        // that stage belongs to Shane; a submitted intake pulls the follow-up
        // date forward instead, which is the thing that actually needs to
        // happen today.
        nextActionDays: 0,
        touch: { ifIn: ['New', 'Contacted', 'Replied', 'Nurture'], nextAction: today() },
        noteTitle: `Handled intake — ${business || email}`,
        noteContent: buildNote(record),
      })
    );
  }

  const results = await Promise.allSettled(tasks);
  for (const r of results) if (r.status === 'rejected') console.log('handled-submit: ' + r.reason);
}

const today = () => new Date().toISOString().slice(0, 10);
