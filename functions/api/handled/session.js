/**
 * Handled intake — the draft session.  GET /api/handled/session
 *                                      PUT /api/handled/session
 *
 * GET returns whatever the client has saved so far, plus the status the page
 * needs to decide what to render (draft, or a read-only look at a submission).
 *
 * PUT is the autosave. It is a merge patch, not a replace: the page sends only
 * the fields that changed, so two tabs open on different sections cannot wipe
 * each other's work, and a save that arrives out of order costs one field
 * rather than the whole form.
 *
 * Unknown keys are dropped rather than rejected. A stale tab still running the
 * previous version of questions.js after a question is renamed should keep
 * saving the fields it does know about, not fail every save.
 *
 * Required bindings:
 *   HANDLED_BUCKET   R2   drafts, submissions, and uploads
 */

import { SECTIONS, questionById } from '../../../assets/handled/questions.js';
import { templateById } from '../../../assets/handled/templates.js';
import { authenticate, updateRecord, json } from '../../lib/handled-store.js';
import { signDownload } from '../../lib/handled-uploads.js';

// A generous ceiling that still bounds the object. Nobody types 20k characters
// into "Best phone number", but a paste of an existing About page into
// "any copy you've already written" is a real thing clients do.
const MAX_FIELD_CHARS = 20_000;
const MAX_LIST_ITEMS = 25;

const INTERNAL = new Set(SECTIONS.filter((s) => s.internal).map((s) => s.id));

export async function onRequestGet(context) {
  const auth = await authenticate(context, { allowSubmitted: true });
  if (auth.response) return auth.response;

  return json(await publicView(context.env, auth.record));
}

export async function onRequestPut(context) {
  let patch;
  try {
    patch = await context.request.json();
  } catch {
    return json({ error: 'Could not read that save.' }, 400);
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return json({ error: 'Could not read that save.' }, 400);
  }

  const out = await updateRecord(context, (record) => applyPatch(record, patch));
  if (out.response) return out.response;

  return json({ ok: true, updatedAt: out.record.updatedAt, applied: out.value });
}

// Runs against a freshly read record, and may run more than once if another
// write lands mid-flight — so it only ever sets fields from `patch` and never
// derives anything from what it read.
// Not questions: where the client last was, and which of the three ways to
// answer they picked. Both exist so a return visit resumes properly rather than
// dumping someone back at the first screen. Kept to an explicit allowlist so
// the record cannot accumulate arbitrary client-supplied keys.
const RESERVED = {
  __screen: (record, v) => { record.lastScreen = String(v || '').slice(0, 40); },
  __answer_mode: (record, v) => {
    record.answerMode = ['record', 'upload', 'type'].includes(v) ? v : null;
  },
};

function applyPatch(record, patch) {
  const applied = [];

  for (const [id, raw] of Object.entries(patch)) {
    if (RESERVED[id]) {
      RESERVED[id](record, raw);
      applied.push(id);
      continue;
    }

    const q = questionById(id);
    if (!q) continue; // unknown field: ignore, don't fail the save

    if (q.type === 'template-picker') {
      // Only an id this build actually offers. A picker choice that no longer
      // exists in config is not a value worth persisting.
      record.template = templateById(String(raw ?? '')) ? String(raw) : null;
      record.answers[id] = record.template;
      applied.push(id);
      continue;
    }

    if (INTERNAL.has(q.sectionId)) {
      record.operations[id] = normaliseInternal(raw);
      applied.push(id);
      continue;
    }

    const value = normalise(raw, q);
    if (value === undefined) continue;
    record.answers[id] = value;
    applied.push(id);
  }

  if (applied.length) record.updatedAt = new Date().toISOString();
  return applied;
}

// Section 3 keeps its answer and its "Not sure" flag together, because the
// difference between "left blank" and "said they don't know" is information
// Shane acts on in the monthly program.
function normaliseInternal(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return {
      answer: clip(raw.answer),
      notSure: Boolean(raw.notSure),
    };
  }
  return { answer: clip(raw), notSure: false };
}

function normalise(raw, q) {
  if (q.type === 'repeatable-text') {
    if (!Array.isArray(raw)) return undefined;
    return raw.slice(0, MAX_LIST_ITEMS).map(clip).filter((s) => s !== '');
  }
  if (raw === null) return '';
  if (typeof raw === 'object') return undefined; // uploads go through their own route
  return clip(raw);
}

function clip(v) {
  if (v === null || v === undefined) return '';
  return String(v).slice(0, MAX_FIELD_CHARS);
}

// What the browser is allowed to see. `label` is our own note about who the
// token was issued to and is never sent to the client.
async function publicView(env, record) {
  // Every uploaded file comes back with a short-lived signed URL so the page can
  // play a recording back on a return visit. Signed per request rather than
  // stored, so a link cannot outlive the session it was minted for.
  const uploads = {};
  for (const [id, files] of Object.entries(record.uploads || {})) {
    uploads[id] = await Promise.all(
      files.map(async (f) => ({ ...f, url: await signDownload(env, f.key, { ttlDays: 2, name: f.name }) }))
    );
  }

  return {
    status: record.status,
    // Whether the client has ever saved anything. `updatedAt` cannot answer
    // this — a freshly issued record already has one — and the Welcome screen
    // exists precisely for people who have not started yet.
    started: Object.keys(record.answers || {}).length > 0 || Object.keys(record.operations || {}).length > 0,
    answers: record.answers || {},
    operations: record.operations || {},
    uploads,
    template: record.template || null,
    transcript: record.transcript || null,
    lastScreen: record.lastScreen || null,
    answerMode: record.answerMode || null,
    updatedAt: record.updatedAt,
    submittedAt: record.submittedAt,
    expiresAt: record.expiresAt,
  };
}
