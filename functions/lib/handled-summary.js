/**
 * Handled intake — renders a submitted record as something a person reads.
 *
 * One builder, two consumers: the email Shane gets and the note filed on the
 * Attio record. Both walk questions.js in config order, so a reworded or
 * reordered question shows up correctly in both without a code change.
 *
 * The output is plain text on purpose. Shane reads these on a phone between
 * jobs and builds from them directly — no dashboard, no rendering step, no
 * horizontal scrolling. Section 3 is appended under its own heading and
 * labelled as internal, because it feeds the monthly program rather than the
 * page being built.
 */

import { SECTIONS, RECORDING_FIELD } from '../../assets/handled/questions.js';
import { templateById } from '../../assets/handled/templates.js';

const RULE = '─'.repeat(34);

export function buildSummary(record, { publicBase = 'https://shanegring.com', links = new Map() } = {}) {
  const out = [];
  const name = record.answers?.business_name || '(no business name given)';

  out.push(`HANDLED INTAKE — ${name}`);
  out.push(`Submitted ${formatWhen(record.submittedAt)}`);
  out.push('');

  for (const section of SECTIONS) {
    if (section.internal) continue; // appended at the end, under its own heading
    out.push(RULE);
    out.push(section.title.toUpperCase());
    out.push('');
    // A recording answers this whole section at once, so the transcript sits
    // above the prompts rather than against any one of them.
    if (section.audio) out.push(...renderRecording(record, publicBase, links));

    for (const q of section.questions) {
      out.push(q.label);
      out.push(renderAnswer(q, record, publicBase, links));
      out.push('');
    }
  }

  const internal = SECTIONS.filter((s) => s.internal);
  for (const section of internal) {
    out.push(RULE);
    out.push(`${section.title.toUpperCase()}  (internal — for the monthly program)`);
    out.push('');
    for (const q of section.questions) {
      const entry = record.operations?.[q.id];
      out.push(q.label);
      out.push(indent(entry?.notSure ? 'Not sure' : text(entry?.answer)));
      out.push('');
    }
  }

  out.push(RULE);
  out.push(`Full record: clients/${record._prefix || '(prefix)'}/record.json`);

  return out.join('\n');
}

function renderAnswer(q, record, publicBase, links = new Map()) {
  if (q.type === 'template-picker') {
    const t = templateById(record.template);
    return indent(t ? `${t.name}  (${t.id})` : 'Not chosen');
  }

  if (q.type === 'file' || q.type === 'files' || q.type === 'text-or-file') {
    const files = record.uploads?.[q.id] || [];
    const typed = record.answers?.[q.id];
    const lines = [];
    if (typed) lines.push(indent(text(typed)));
    if (files.length) {
      for (const f of files) {
        lines.push(indent(`${f.name}  (${mb(f.size)})`));
        lines.push(indent('  ' + fileLink(f, publicBase, links)));
      }
    }
    return lines.length ? lines.join('\n') : indent('—');
  }

  if (q.type === 'repeatable-text') {
    const list = record.answers?.[q.id];
    if (!Array.isArray(list) || !list.length) return indent('—');
    return list.map((v) => indent(`• ${v}`)).join('\n');
  }

  return indent(text(record.answers?.[q.id]));
}

// The recording block: the transcript is the thing Shane reads, and the audio
// link is there for the times the transcript is ambiguous or a name is wrong.
function renderRecording(record, publicBase, links) {
  const files = record.uploads?.[RECORDING_FIELD] || [];
  const t = record.transcript;
  if (!files.length && !t?.text) return [];

  const out = ['RECORDED ANSWER', ''];

  if (t?.status === 'ok' && t.text) {
    out.push(indent(wrap(t.text)));
    out.push('');
    out.push(indent(`(transcribed automatically${t.words ? `, ${t.words} words` : ''} — the audio is below if a name looks wrong)`));
  } else if (files.length) {
    out.push(indent('Not transcribed — have a listen.'));
  }

  for (const f of files) {
    out.push('');
    out.push(indent(`${f.name}  (${mb(f.size)}${f.durationSec ? `, ${mmss(f.durationSec)}` : ''})`));
    out.push(indent('  ' + fileLink(f, publicBase, links)));
  }
  out.push('');
  return out;
}

const fileLink = (f, publicBase, links) => {
  const signed = links.get(f.key);
  return signed ? publicBase + signed : '(link unavailable)';
};

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// Shane reads these on a phone, so a wall of transcript gets wrapped rather
// than arriving as one unbroken line.
function wrap(text, width = 68) {
  const out = [];
  for (const para of String(text).split(/\n+/)) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      if ((line + ' ' + word).trim().length > width) { out.push(line.trim()); line = word; }
      else line += ' ' + word;
    }
    if (line.trim()) out.push(line.trim());
  }
  return out.join('\n');
}

// A blank answer is meaningful — it says the client chose to skip it — so it
// gets a visible mark rather than an empty line Shane has to interpret.
const text = (v) => {
  const s = (v ?? '').toString().trim();
  return s === '' ? '—' : s;
};

const indent = (s) => s.split('\n').map((l) => '    ' + l).join('\n');

const mb = (n) => (Number.isFinite(n) ? (n >= 1048576 ? Math.round(n / 1048576) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB') : '?');

function formatWhen(iso) {
  const d = new Date(iso || Date.now());
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

// Shorter form for the Attio note, which sits beside a person record that
// already carries the name and email.
export function buildNote(record, opts) {
  return buildSummary(record, opts);
}
