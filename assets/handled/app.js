/**
 * Handled intake — the client-facing app.
 *
 * Renders entirely from assets/handled/questions.js and templates.js. There is
 * no question text, no section, and no ordering in this file; adding a seventh
 * template or rewording a prompt is a config edit, not a code change.
 *
 * The token lives in the URL fragment (#t=...). Fragments are never sent to a
 * server, so the credential stays out of request logs, out of Referer headers,
 * and out of any analytics — which is why this page also carries no tag
 * manager. It survives reload, which is what makes "come back tomorrow" work.
 *
 * Design constraint driving all of this: the client has already paid, so the
 * risk is abandonment, not bad data. Hence autosave on every keystroke, any
 * section in any order, four required fields in the whole form, and a save
 * indicator that is always telling the truth.
 */

import { SECTIONS, WELCOME, CONFIRMATION, questionById, allQuestions, RECORDING_FIELD } from './questions.js?v=acc03e6d';
import { TEMPLATES, PLACEHOLDER_PREVIEW, templateBlurb, templateById } from './templates.js?v=c6787910';
import { acceptAttr, formatBytes, validateUpload, GROUPS, canRecord, pickRecordType,
         extensionForType, RECORD_BITRATE, RECORD_MAX_SECONDS } from './uploads.js?v=5f553a01';

const API = '/api/handled';
const SAVE_DEBOUNCE_MS = 600;

const root = document.getElementById('hi-app');

const state = {
  token: '',
  status: 'draft',
  answers: {},
  operations: {},
  uploads: {},
  template: null,
  updatedAt: null,
  screen: 'welcome',          // 'welcome' | <section id> | 'review' | 'done'
  started: false,
  transcript: null,
  recBlobUrl: null,
  rec: { active: false, abandoned: false, startedAt: 0, recorder: null, stream: null, interval: null },
  save: { phase: 'idle', at: null, pending: 0 },
  showMissing: false,         // only after a blocked submit — never pre-emptively
  serverMissing: [],          // what the server said was missing, if it disagreed
  lastScreen: null,           // where they left off, so a return visit resumes there
  answerMode: null,           // record | upload | type, remembered across visits
};

const SCREENS = () => ['welcome', ...SECTIONS.map((s) => s.id), 'review', 'done'];

// --- boot ------------------------------------------------------------------

boot();

async function boot() {
  const token = readToken();
  if (!token) return renderFatal('no_token');
  state.token = token;

  try {
    const res = await fetch(`${API}/session`, { headers: { 'X-Handled-Token': token } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return renderFatal(body.error || 'invalid_link');
    }
    const data = await res.json();
    Object.assign(state, {
      status: data.status,
      answers: data.answers || {},
      operations: data.operations || {},
      uploads: data.uploads || {},
      template: data.template || null,
      updatedAt: data.updatedAt || null,
      started: Boolean(data.started),
      transcript: data.transcript || null,
      lastScreen: data.lastScreen || null,
      answerMode: data.answerMode || null,
    });
    // Someone returning to a finished intake gets the read-only look back,
    // not the form again.
    state.screen = data.status === 'submitted' ? 'done' : firstUnfinishedScreen();
    render();
  } catch {
    renderFatal('offline');
  }
}

function readToken() {
  const m = /[#&]t=([A-Za-z0-9_-]+)/.exec(location.hash || '');
  return m ? m[1] : '';
}

// Drop someone back where the work actually is, rather than making them click
// through screens they already finished.
function firstUnfinishedScreen() {
  // Nothing saved yet: this is their first visit, so start at the beginning.
  if (!state.started) return 'welcome';

  // Where they actually left off. Counting unanswered questions cannot stand in
  // for this: nearly every question is optional by design, so someone who
  // worked through all six sections and skipped a phone number would be sent
  // back to section one on every visit — the opposite of what resuming is for.
  const order = SCREENS();
  if (state.lastScreen && order.includes(state.lastScreen)) return state.lastScreen;

  // No record of where they were (a draft from before this was stored). Fall
  // back to the first section still missing something required.
  for (const s of SECTIONS) {
    if (s.questions.some((q) => q.required && !answered(q))) return s.id;
  }
  return 'review';
}

// --- persistence -----------------------------------------------------------

const queue = new Map();
let saveTimer = null;
// The PUT currently in flight, if any. Without this, `await flush()` returns
// immediately whenever the queue happens to be empty — even though a save
// started 200ms ago is still running — and submit() would race it.
let inFlight = null;

function stage(id, value) {
  queue.set(id, value);
  state.save.phase = 'pending';
  paintSaveState();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
}

async function flush() {
  // Whoever called us wants the record settled, so wait out anything running
  // before deciding there is nothing to do.
  if (inFlight) await inFlight.catch(() => {});
  if (!queue.size || state.status === 'submitted') return;

  const patch = Object.fromEntries(queue);
  queue.clear();

  state.save.phase = 'saving';
  state.save.pending++;
  paintSaveState();

  try {
    inFlight = fetch(`${API}/session`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Handled-Token': state.token },
      body: JSON.stringify(patch),
    });
    const res = await inFlight;
    if (!res.ok) throw new Error(String(res.status));
    const body = await res.json();
    state.updatedAt = body.updatedAt;
    state.save.phase = 'saved';
    state.save.at = new Date();
  } catch {
    // Put the work back so the next keystroke retries it. Nothing is lost
    // from the client's point of view, and the indicator says so plainly.
    for (const [k, v] of Object.entries(patch)) if (!queue.has(k)) queue.set(k, v);
    state.save.phase = 'error';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 4000);
  } finally {
    inFlight = null;
    state.save.pending--;
    paintSaveState();
  }
}

// A last-chance save when the tab goes away. Not a guarantee, just a courtesy
// on top of the debounce — which is short enough that this rarely has work.
addEventListener('hashchange', async () => {
  if (readToken() === state.token) return;
  // Save what the previous client typed before switching away from their
  // record — clearing the queue outright drops up to a debounce of work.
  clearTimeout(saveTimer);
  await flush().catch(() => {});
  queue.clear();
  Object.assign(state, { answers: {}, operations: {}, uploads: {}, template: null, started: false, status: 'draft' });
  boot();
});

addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
addEventListener('pagehide', flush);

// --- value access ----------------------------------------------------------

function getValue(q) {
  if (q.type === 'template-picker') return state.template || '';
  if (isInternal(q)) return state.operations[q.id]?.answer ?? '';
  const v = state.answers[q.id];
  if (q.type === 'repeatable-text') return Array.isArray(v) ? v : [];
  return v ?? '';
}

const getNotSure = (q) => Boolean(state.operations[q.id]?.notSure);

function setValue(q, value) {
  if (q.type === 'template-picker') {
    state.template = value || null;
    state.answers[q.id] = state.template;
  } else if (isInternal(q)) {
    state.operations[q.id] = { answer: value, notSure: getNotSure(q) };
  } else {
    state.answers[q.id] = value;
  }
  stage(q.id, isInternal(q) ? state.operations[q.id] : value);
}

function setNotSure(q, on) {
  const answer = state.operations[q.id]?.answer ?? '';
  state.operations[q.id] = { answer, notSure: on };
  stage(q.id, state.operations[q.id]);
}

const isInternal = (q) => SECTIONS.find((s) => s.id === q.sectionId || s.questions.includes(q))?.internal === true;

function answered(q) {
  if (q.type === 'template-picker') return Boolean(state.template);
  if (isInternal(q)) {
    const e = state.operations[q.id];
    return Boolean(e && (e.notSure || String(e.answer || '').trim()));
  }
  if (q.type === 'file' || q.type === 'files') return (state.uploads[q.id] || []).length > 0;
  if (q.type === 'text-or-file') {
    return Boolean(String(state.answers[q.id] || '').trim()) || (state.uploads[q.id] || []).length > 0;
  }
  const v = getValue(q);
  return Array.isArray(v) ? v.length > 0 : String(v).trim() !== '';
}

const sectionProgress = (s) => ({ answered: s.questions.filter(answered).length, total: s.questions.length });

function missingRequired() {
  const own = SECTIONS.flatMap((s) =>
    s.questions.filter((q) => q.required && !answered(q)).map((q) => ({ ...q, sectionId: s.id }))
  );
  // Anything the server named that we did not: include it so the client sees a
  // real reason rather than a button that does nothing.
  const seen = new Set(own.map((q) => q.id));
  for (const id of state.serverMissing || []) {
    if (seen.has(id)) continue;
    const q = allQuestions().find((x) => x.id === id);
    if (q) own.push(q);
  }
  return own;
}

// --- render ----------------------------------------------------------------

function render() {
  root.dataset.state = 'ready';
  root.innerHTML = '';

  if (state.screen === 'done' || state.status === 'submitted') {
    root.append(screenDone());
    window.scrollTo(0, 0);
    return;
  }

  const shell = el('div', 'hi-shell');
  const inner = el('div', 'container hi-grid');
  inner.append(rail(), column());
  shell.append(inner);
  root.append(shell);
  window.scrollTo(0, 0);
}

function column() {
  const col = el('div', 'hi-col');
  if (state.screen === 'welcome') col.append(screenWelcome());
  else if (state.screen === 'review') col.append(screenReview());
  else col.append(screenSection(SECTIONS.find((s) => s.id === state.screen)));
  col.append(pager());
  return col;
}

// --- the rail: the one place this design spends anything ---------------------
// It exists to answer the question that makes people abandon a form they have
// already paid for — "is this saved, and how much is left?" — without their
// having to ask it. Everything else on the page stays deliberately quiet.

function rail() {
  const nav = el('nav', 'hi-rail');
  nav.setAttribute('aria-label', 'Intake sections');

  const list = el('ol', 'hi-rail-list');
  list.append(railItem('welcome', 'Start', null));
  for (const s of SECTIONS) list.append(railItem(s.id, s.screen, sectionProgress(s)));
  list.append(railItem('review', 'Review and send', null));
  nav.append(list);

  const save = el('p', 'hi-save');
  save.id = 'hi-save';
  nav.append(save);
  queueMicrotask(paintSaveState);
  return nav;
}

function railItem(id, label, progress) {
  const li = el('li', 'hi-rail-item');
  const b = el('button', 'hi-rail-btn');
  b.type = 'button';
  if (state.screen === id) { b.classList.add('is-current'); b.setAttribute('aria-current', 'step'); }

  const complete = progress && progress.answered === progress.total && progress.total > 0;
  if (complete) b.classList.add('is-complete');

  b.append(ring(progress, complete));
  b.append(el('span', 'hi-rail-label', label));

  if (progress) {
    const count = el('span', 'hi-rail-count', complete ? 'All answered' : `${progress.answered} of ${progress.total}`);
    b.append(count);
  }
  b.addEventListener('click', () => go(id));
  li.append(b);
  return li;
}

// A ring rather than a checkmark: most of these questions are optional, so
// "partly done" is a normal resting state and needs to look like one instead
// of like a failure.
function ring(progress, complete) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'hi-ring');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');

  const track = document.createElementNS(NS, 'circle');
  track.setAttribute('cx', '10'); track.setAttribute('cy', '10'); track.setAttribute('r', '8');
  track.setAttribute('class', 'hi-ring-track');
  svg.append(track);

  if (progress && progress.total) {
    const pct = progress.answered / progress.total;
    const c = 2 * Math.PI * 8;
    const arc = document.createElementNS(NS, 'circle');
    arc.setAttribute('cx', '10'); arc.setAttribute('cy', '10'); arc.setAttribute('r', '8');
    arc.setAttribute('class', 'hi-ring-arc');
    arc.setAttribute('stroke-dasharray', `${(c * pct).toFixed(2)} ${c.toFixed(2)}`);
    svg.append(arc);
  }
  if (complete) {
    const tick = document.createElementNS(NS, 'path');
    tick.setAttribute('d', 'M6.5 10.2l2.4 2.4 4.6-5.1');
    tick.setAttribute('class', 'hi-ring-tick');
    svg.append(tick);
  }
  return svg;
}

function paintSaveState() {
  const node = document.getElementById('hi-save');
  if (!node) return;
  const { phase, at } = state.save;
  node.className = 'hi-save is-' + phase;
  if (phase === 'saving' || phase === 'pending') node.textContent = 'Saving…';
  else if (phase === 'error') node.textContent = 'Not saved yet — still trying. Leave this tab open.';
  else if (phase === 'saved' || state.updatedAt) node.textContent = 'Saved' + (at ? ' at ' + timeOf(at) : '');
  else node.textContent = 'Saves as you type';
}

const timeOf = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// --- screens ---------------------------------------------------------------

function screenWelcome() {
  const wrap = el('div', 'hi-screen');
  wrap.append(el('span', 'section-eyebrow', 'Handled'));
  wrap.append(el('h1', 'cs-hook', WELCOME.title));
  wrap.append(el('p', 'om-lede', WELCOME.lede));

  const box = el('div', 'hi-handy');
  box.append(el('h2', 'hi-handy-title', 'Worth having nearby'));
  const ul = el('ul', 'hi-handy-list');
  for (const item of WELCOME.handy) ul.append(el('li', '', item));
  box.append(ul);
  wrap.append(box);

  wrap.append(el('p', 'hi-reassure', WELCOME.reassurance));
  return wrap;
}

function screenSection(section) {
  const wrap = el('div', 'hi-screen');
  wrap.append(el('span', 'section-eyebrow', section.screen));
  wrap.append(el('h1', 'cs-hook', section.title));
  if (section.intro) wrap.append(el('p', 'om-lede', section.intro));

  if (section.audio) wrap.append(audioChooser(section));

  const fields = el('div', 'hi-fields');
  fields.id = 'hi-fields';
  for (const q of section.questions) fields.append(field({ ...q, sectionId: section.id }));
  wrap.append(fields);
  return wrap;
}

function screenReview() {
  const wrap = el('div', 'hi-screen');
  wrap.append(el('span', 'section-eyebrow', 'Last look'));
  wrap.append(el('h1', 'cs-hook', 'Everything you’ve told me.'));
  wrap.append(el('p', 'om-lede',
    'Change anything that isn’t right — every line jumps back to its question. ' +
    'Once you send it, this link becomes a read-only copy.'));

  const missing = missingRequired();
  if (state.showMissing && missing.length) {
    const warn = el('div', 'hi-warn');
    warn.setAttribute('role', 'alert');
    warn.append(el('strong', '', missing.length === 1 ? 'One answer is still needed.' : `${missing.length} answers are still needed.`));
    const ul = el('ul', 'hi-warn-list');
    for (const q of missing) {
      const li = el('li');
      const a = el('button', 'hi-warn-link', q.label);
      a.type = 'button';
      a.addEventListener('click', () => go(q.sectionId));
      li.append(a);
      ul.append(li);
    }
    warn.append(ul);
    wrap.append(warn);
  }

  for (const s of SECTIONS) {
    const block = el('div', 'hi-review-block');
    const head = el('div', 'hi-review-head');
    head.append(el('h2', 'hi-review-title', s.title));
    const edit = el('button', 'hi-review-edit', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => go(s.id));
    head.append(edit);
    block.append(head);

    const dl = el('dl', 'hi-review-list');
    for (const q of s.questions) {
      dl.append(el('dt', 'hi-review-q', q.label));
      dl.append(reviewAnswer({ ...q, sectionId: s.id }));
    }
    block.append(dl);
    wrap.append(block);
  }

  const send = el('button', 'contact-submit hi-send');
  send.type = 'button';
  send.append(document.createTextNode('Send it to Shane '));
  send.append(el('span', 'btn-arrow', '→'));
  send.addEventListener('click', () => submit(send));
  wrap.append(send);
  return wrap;
}

function reviewAnswer(q) {
  const dd = el('dd', 'hi-review-a');
  if (q.type === 'template-picker') {
    const t = templateById(state.template);
    dd.textContent = t ? t.name : '';
    if (!t) dd.classList.add('is-empty'), (dd.textContent = 'Not chosen yet');
    return dd;
  }
  if (isInternal(q) && getNotSure(q)) {
    dd.textContent = 'Not sure';
    dd.classList.add('is-notsure');
    return dd;
  }
  if (q.type === 'repeatable-text') {
    const list = getValue(q);
    if (!list.length) return empty(dd);
    const ul = el('ul', 'hi-review-ul');
    for (const v of list) ul.append(el('li', '', v));
    dd.append(ul);
    return dd;
  }
  if (['file', 'files', 'text-or-file'].includes(q.type)) {
    const files = state.uploads[q.id] || [];
    const typed = String(state.answers[q.id] || '').trim();
    if (!files.length && !typed) return empty(dd);
    if (typed) dd.append(el('p', 'hi-review-text', typed));
    for (const f of files) dd.append(el('p', 'hi-review-file', `${f.name} (${formatBytes(f.size)})`));
    return dd;
  }
  const v = String(getValue(q)).trim();
  if (!v) return empty(dd);
  dd.textContent = v;
  return dd;
}

const empty = (dd) => { dd.textContent = 'Skipped'; dd.classList.add('is-empty'); return dd; };

function screenDone() {
  const wrap = el('div', 'hi-screen hi-screen-done');
  const sec = el('section', 'om-hero');
  const c = el('div', 'container');
  c.append(el('span', 'section-eyebrow', 'Handled'));
  c.append(el('h1', 'cs-hook', CONFIRMATION.title));
  for (const p of CONFIRMATION.body) c.append(el('p', 'om-lede', p));

  const note = el('p', 'hi-reassure');
  note.append(document.createTextNode('Questions before then? Email '));
  const a = el('a', '', CONFIRMATION.contact);
  a.href = 'mailto:' + CONFIRMATION.contact;
  note.append(a);
  note.append(document.createTextNode('. This link stays open as a copy of what you sent.'));
  c.append(note);

  if (state.status === 'submitted') {
    const details = el('details', 'hi-sent');
    details.append(el('summary', '', 'See what you sent'));
    for (const s of SECTIONS) {
      details.append(el('h2', 'hi-review-title', s.title));
      const dl = el('dl', 'hi-review-list');
      for (const q of s.questions) {
        dl.append(el('dt', 'hi-review-q', q.label));
        dl.append(reviewAnswer({ ...q, sectionId: s.id }));
      }
      details.append(dl);
    }
    c.append(details);
  }
  sec.append(c);
  wrap.append(sec);
  return wrap;
}

// --- fields ----------------------------------------------------------------

function field(q) {
  const wrap = el('div', 'hi-field');
  wrap.dataset.qid = q.id;

  const label = el('label', 'hi-label');
  label.setAttribute('for', 'f-' + q.id);
  label.append(el('span', 'hi-label-text', q.label));
  if (q.required) label.append(el('span', 'hi-req', 'needed'));
  wrap.append(label);
  if (q.help) wrap.append(el('p', 'hi-help', q.help));

  if (state.showMissing && q.required && !answered(q)) wrap.classList.add('is-missing');

  switch (q.type) {
    case 'textarea':         wrap.append(textareaField(q)); break;
    case 'template-picker':  wrap.append(templatePicker(q)); break;
    case 'repeatable-text':  wrap.append(repeatable(q)); break;
    case 'file':
    case 'files':
    case 'text-or-file':     wrap.append(uploadField(q)); break;
    default:                 wrap.append(inputField(q));
  }
  return wrap;
}

function inputField(q) {
  const i = el('input', 'hi-input');
  i.id = 'f-' + q.id;
  i.type = q.type === 'email' ? 'email' : q.type === 'tel' ? 'tel' : 'text';
  if (q.autocomplete) i.autocomplete = q.autocomplete;
  if (q.placeholder) i.placeholder = q.placeholder;
  i.value = getValue(q);
  i.addEventListener('input', () => setValue(q, i.value));
  return i;
}

function textareaField(q) {
  const box = el('div', 'hi-textwrap');
  const t = el('textarea', 'hi-textarea');
  t.id = 'f-' + q.id;
  t.rows = 4;
  t.value = getValue(q);
  t.addEventListener('input', () => { setValue(q, t.value); grow(t); });
  queueMicrotask(() => grow(t));
  box.append(t);

  if (q.notSure) {
    const b = el('button', 'hi-notsure');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(getNotSure(q)));
    b.textContent = 'Not sure';
    if (getNotSure(q)) { b.classList.add('is-on'); t.disabled = true; }
    b.addEventListener('click', () => {
      const on = !getNotSure(q);
      setNotSure(q, on);
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-on', on);
      t.disabled = on;
      refreshRail();
    });
    box.append(b);
  }
  return box;
}

// Grow to fit rather than scroll inside a small box — on a phone, a textarea
// that scrolls internally hides the sentence you just typed.
function grow(t) {
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight + 2, 480) + 'px';
}

function repeatable(q) {
  const wrap = el('div', 'hi-repeat');
  const values = getValue(q).slice();
  if (!values.length) values.push('');

  const redraw = () => {
    wrap.innerHTML = '';
    values.forEach((v, i) => {
      const row = el('div', 'hi-repeat-row');
      const input = el('input', 'hi-input');
      if (i === 0) input.id = 'f-' + q.id;
      input.type = 'url';
      input.placeholder = q.placeholder || '';
      input.value = v;
      input.addEventListener('input', () => {
        values[i] = input.value;
        setValue(q, values.filter((s) => s.trim() !== ''));
        refreshRail();
      });
      row.append(input);

      if (values.length > 1) {
        const rm = el('button', 'hi-repeat-rm');
        rm.type = 'button';
        rm.setAttribute('aria-label', 'Remove this link');
        rm.textContent = '×';
        rm.addEventListener('click', () => {
          values.splice(i, 1);
          setValue(q, values.filter((s) => s.trim() !== ''));
          redraw(); refreshRail();
        });
        row.append(rm);
      }
      wrap.append(row);
    });
    const add = el('button', 'hi-repeat-add', '+ Add another');
    add.type = 'button';
    add.addEventListener('click', () => { values.push(''); redraw(); });
    wrap.append(add);
  };
  redraw();
  return wrap;
}

function templatePicker(q) {
  const grid = el('div', 'hi-templates');
  grid.setAttribute('role', 'radiogroup');
  grid.setAttribute('aria-label', q.label);

  for (const t of TEMPLATES) {
    const card = el('button', 'hi-template');
    card.type = 'button';
    card.setAttribute('role', 'radio');
    const on = state.template === t.id;
    card.setAttribute('aria-checked', String(on));
    if (on) card.classList.add('is-on');

    const img = el('img', 'hi-template-img');
    img.src = t.previewImage;
    img.alt = '';
    img.loading = 'lazy';
    img.width = 320; img.height = 240;
    // A preview Chris hasn't produced yet must not render as a broken image.
    img.addEventListener('error', () => { img.src = PLACEHOLDER_PREVIEW; }, { once: true });
    card.append(img);

    card.append(el('span', 'hi-template-name', t.name));
    const blurb = templateBlurb(t);
    if (blurb) card.append(el('span', 'hi-template-desc', blurb));

    card.addEventListener('click', () => { setValue(q, t.id); render(); });
    grid.append(card);
  }
  return grid;
}

// --- uploading -------------------------------------------------------------

/**
 * Three steps, deliberately separate: ask for somewhere to put it, put it
 * there, then tell the record it arrived. Splitting the byte transfer from the
 * record write means a connection lost mid-upload changes nothing — the file
 * either landed and got filed, or it didn't and there is nothing to undo.
 *
 * XHR rather than fetch, because fetch still cannot report upload progress and
 * a silent progress bar is exactly what makes someone close the tab.
 */
async function uploadFile(questionId, file, onProgress) {
  const local = validateUpload(groupFor(questionId), { name: file.name, size: file.size, type: file.type });
  if (local) throw new Error(local);

  const target = await api('/upload', {
    method: 'POST',
    body: JSON.stringify({ questionId, name: file.name, size: file.size, type: file.type }),
  });

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method, target.url, true);
    if (target.direct) xhr.setRequestHeader('X-Handled-Token', state.token);
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    const failed = () => reject(new Error(
      'That upload didn’t go through. Your connection may have dropped — try it again.'
    ));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : failed());
    xhr.onerror = failed;
    xhr.ontimeout = failed;
    xhr.send(file);
  });

  onProgress(1);
  return api('/attach', {
    method: 'POST',
    body: JSON.stringify({
      questionId, key: target.key, name: file.name, size: file.size, type: file.type,
      durationSec: file.__durationSec,
    }),
  });
}

/**
 * Server error codes are for the log; anything reaching a client has to be a
 * sentence. `already_submitted` on screen after a five-minute recording is
 * worse than no message at all.
 *
 * Some endpoints already return prose (validateUpload's messages come straight
 * back from /upload), so a value containing a space is passed through as-is.
 */
function clientMessage(err) {
  if (CODE_MESSAGES[err]) return CODE_MESSAGES[err];
  if (typeof err === 'string' && err.includes(' ')) return err;
  return 'That didn’t work. Try again in a moment.';
}

const CODE_MESSAGES = {
  invalid_link: 'This link isn’t working any more. Email shane@shanegring.com for a fresh one.',
  expired_link: 'This link has expired. Email shane@shanegring.com and I’ll send a new one.',
  already_submitted: 'This intake has already been sent, so it can’t be changed.',
};

function groupFor(questionId) {
  if (questionId === RECORDING_FIELD) return 'audio';
  return questionById(questionId)?.accept || 'image';
}

async function api(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Handled-Token': state.token, ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(clientMessage(body.error));
  return body;
}

function uploadField(q) {
  const wrap = el('div', 'hi-upload');
  const list = el('div', 'hi-files');
  const multiple = q.type === 'files';

  const paint = () => {
    list.innerHTML = '';
    for (const f of state.uploads[q.id] || []) list.append(fileRow(q, f, paint));
  };
  paint();
  wrap.append(list);

  const done = () => (state.uploads[q.id] || []).length;
  const box = el('label', 'hi-drop');
  const input = el('input');
  input.type = 'file';
  input.accept = acceptAttr(q.accept || 'image');
  input.multiple = multiple;
  input.className = 'hi-drop-input';

  const label = el('span', 'hi-drop-text', multiple ? 'Choose files' : 'Choose a file');
  box.append(input, el('span', 'hi-drop-icon', '↑'), label,
    el('span', 'hi-drop-hint', `${GROUPS[q.accept || 'image'].label}, up to ${formatBytes(GROUPS[q.accept || 'image'].maxBytes)} each`));

  const err = el('p', 'hi-file-error');
  err.setAttribute('role', 'alert');

  const take = async (files) => {
    err.textContent = '';
    for (const file of files) {
      const row = pendingRow(file);
      list.append(row.node);
      try {
        const out = await uploadFile(q.id, file, row.progress);
        // Replace only on success. Clearing first meant a failed re-upload made
        // the client's existing logo vanish from the page while the server
        // still had it, recoverable only by reloading.
        state.uploads[q.id] = multiple ? [...(state.uploads[q.id] || []), out.file] : [out.file];
        paint(); refreshRail();
      } catch (e) {
        row.node.remove();
        err.textContent = e.message;
      }
    }
    input.value = '';
  };

  input.addEventListener('change', () => take([...input.files]));

  // Drag and drop is a desktop nicety; the label/input above is what phones use.
  box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('is-over'); });
  box.addEventListener('dragleave', () => box.classList.remove('is-over'));
  box.addEventListener('drop', (e) => {
    e.preventDefault(); box.classList.remove('is-over');
    take([...(e.dataTransfer?.files || [])]);
  });

  wrap.append(box, err);

  if (q.type === 'text-or-file') {
    wrap.append(el('p', 'hi-upload-or', 'Or paste it straight in:'));
    const t = el('textarea', 'hi-textarea');
    t.id = 'f-' + q.id;
    t.rows = 4;
    t.value = String(state.answers[q.id] || '');
    t.addEventListener('input', () => { state.answers[q.id] = t.value; stage(q.id, t.value); grow(t); refreshRail(); });
    queueMicrotask(() => grow(t));
    wrap.append(t);
  }
  return wrap;
}

function fileRow(q, f, paint) {
  const row = el('div', 'hi-file');
  row.append(el('span', 'hi-file-name', f.name));
  row.append(el('span', 'hi-file-meta', formatBytes(f.size) + (f.durationSec ? ` · ${mmss(f.durationSec)}` : '')));
  const rm = el('button', 'hi-file-rm', 'Remove');
  rm.type = 'button';
  rm.addEventListener('click', async () => {
    rm.disabled = true;
    try {
      await api('/detach', { method: 'POST', body: JSON.stringify({ questionId: q.id, key: f.key }) });
      state.uploads[q.id] = (state.uploads[q.id] || []).filter((x) => x.key !== f.key);
      if (q.id === RECORDING_FIELD) { state.transcript = null; releaseBlobUrl(); }
      paint(); refreshRail();
    } catch { rm.disabled = false; }
  });
  row.append(rm);
  return row;
}

function pendingRow(file) {
  const node = el('div', 'hi-file is-uploading');
  node.append(el('span', 'hi-file-name', file.name));
  const bar = el('span', 'hi-file-bar');
  const fill = el('span', 'hi-file-fill');
  bar.append(fill);
  node.append(bar);
  const pct = el('span', 'hi-file-meta', '0%');
  node.append(pct);
  return {
    node,
    progress: (r) => {
      fill.style.width = Math.round(r * 100) + '%';
      pct.textContent = Math.round(r * 100) + '%';
    },
  };
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// --- the three ways to answer ----------------------------------------------

// Presented as equals, because they are. Plenty of people will not record
// themselves and their typed answers are worth exactly as much. Recording is
// listed first only because it is the fastest, and it disappears entirely on a
// browser that cannot do it rather than sitting there broken.
function audioChooser(section) {
  const wrap = el('div', 'hi-ways');
  const recordable = canRecord();

  const modes = [
    ...(recordable ? [{ id: 'record', label: 'Record it', note: 'Talk for five minutes' }] : []),
    { id: 'upload', label: 'Upload a recording', note: 'A voice memo works' },
    { id: 'type', label: 'Type it instead', note: 'Answer in writing' },
  ];

  const current = state.answerMode || (recordable ? 'record' : 'type');

  const row = el('div', 'hi-ways-row');
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-label', 'How would you like to answer?');
  row.style.setProperty('--ways', String(modes.length));

  for (const m of modes) {
    const b = el('button', 'hi-way');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(m.id === current));
    if (m.id === current) b.classList.add('is-on');
    b.append(el('span', 'hi-way-label', m.label), el('span', 'hi-way-note', m.note));
    b.addEventListener('click', () => {
      state.answerMode = m.id;
      stage('__answer_mode', m.id);
      render();
    });
    row.append(b);
  }
  wrap.append(row);

  if (current === 'record') wrap.append(recorder(section));
  else if (current === 'upload') wrap.append(uploadField({ id: RECORDING_FIELD, type: 'file', accept: 'audio' }));

  // Both paths leave the file in the same place, so playback is rendered once
  // here rather than duplicated inside the recorder and the upload control.
  const rec = (state.uploads[RECORDING_FIELD] || [])[0];
  if (current !== 'type' && rec) {
    const panel = playbackPanel(rec);
    if (panel) wrap.append(panel);
  }
  if (current !== 'type' && state.transcript) wrap.append(transcriptPanel());

  return wrap;
}

/**
 * Listening back.
 *
 * Weighted by whether there is a transcript, because the two are answering the
 * same question — "did that actually work?" — and the transcript answers it in
 * five seconds of skimming rather than five minutes of listening.
 *
 * With a transcript: a quiet toggle. Present for the person who wants to check
 * they were not drowned out by the van, but not a step, because inviting
 * someone to listen to their own voice invites them to cringe and re-record,
 * and that loop costs five minutes a go on the longest part of the form.
 *
 * Without one: promoted, since otherwise the client has no evidence at all
 * that their recording came out.
 */
function playbackPanel(entry) {
  const src = state.recBlobUrl || entry.url;
  if (!src) return null;

  const wrap = el('div', 'hi-playback');
  const player = el('audio', 'hi-audio');
  player.controls = true;
  player.preload = 'metadata';
  player.src = src;

  const hasTranscript = state.transcript?.status === 'ok';
  if (!hasTranscript) {
    wrap.append(el('p', 'hi-playback-label', 'Have a listen and check it came out.'));
    wrap.append(player);
    return wrap;
  }

  const toggle = el('button', 'hi-playback-toggle', 'Play it back');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  player.hidden = true;
  toggle.addEventListener('click', () => {
    const open = player.hidden;
    player.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide the recording' : 'Play it back';
    // A media element that was display:none when its src was set may have
    // deferred loading entirely, leaving a dead-looking control on reveal.
    // load() is a no-op if it already started.
    if (open && player.readyState === 0) player.load();
  });
  wrap.append(toggle, player);
  return wrap;
}

function transcriptPanel() {
  const t = state.transcript;
  const box = el('div', 'hi-transcript');
  if (t.status === 'ok') {
    box.append(el('h3', 'hi-transcript-title', 'What we heard'));
    box.append(el('p', 'hi-transcript-text', t.text));
    box.append(el('p', 'hi-transcript-note',
      'Shane gets this and your recording. Worth a quick skim — if a name or a number came through wrong, record it again.'));
    // Never let placeholder text pass for a real transcription of real audio,
    // but say so in its own line rather than inside the paragraph, where it
    // both reads badly and is easier to skim past.
    if (t.stub) {
      const flag = el('p', 'hi-transcript-stub',
        'Placeholder text — real transcription switches on with the Cloudflare AI binding.');
      box.append(flag);
    }
  } else {
    box.classList.add('is-note');
    box.append(el('p', 'hi-transcript-note', t.message || 'Your recording is saved — Shane will listen to it.'));
  }
  return box;
}

// --- the recorder ----------------------------------------------------------

function recorder(section) {
  const wrap = el('div', 'hi-rec');
  const existing = (state.uploads[RECORDING_FIELD] || [])[0];

  if (existing && !state.rec.active) {
    wrap.append(el('p', 'hi-rec-done', `Recorded — ${mmss(existing.durationSec || 0)}`));
    // Not .btn-secondary: that one is deliberately borderless because it always
    // sits next to a primary button. Alone in this card it reads as static text.
    const again = el('button', 'hi-rec-again', 'Record again');
    again.type = 'button';
    again.addEventListener('click', async () => {
      again.disabled = true;
      try {
        await api('/detach', { method: 'POST', body: JSON.stringify({ questionId: RECORDING_FIELD, key: existing.key }) });
        state.uploads[RECORDING_FIELD] = [];
        state.transcript = null;
        releaseBlobUrl();
        render();
      } catch (e) {
        again.disabled = false;
        const err = el('p', 'hi-rec-status is-error', e.message);
        err.setAttribute('role', 'alert');
        again.after(err);
      }
    });
    wrap.append(again);
    return wrap;
  }

  const status = el('p', 'hi-rec-status', 'Nothing recorded yet.');
  const timer = el('div', 'hi-rec-timer', '0:00');
  const btn = el('button', 'hi-rec-btn');
  btn.type = 'button';
  btn.append(el('span', 'hi-rec-dot'), el('span', 'hi-rec-btn-label', 'Start recording'));

  // The prompts stay on screen while recording. Someone talking to their phone
  // for five minutes needs to see what they are answering; hiding them behind
  // the recording UI is how you get a client who dries up after question two.
  const prompts = el('ol', 'hi-rec-prompts');
  for (const q of section.questions) prompts.append(el('li', 'hi-rec-prompt', q.label));

  wrap.append(status, timer, btn, prompts);

  btn.addEventListener('click', () => (state.rec.active ? stopRecording() : startRecording()));

  function tick() {
    const secs = (Date.now() - state.rec.startedAt) / 1000;
    timer.textContent = mmss(secs);
    if (secs >= RECORD_MAX_SECONDS) stopRecording();
  }

  async function startRecording() {
    status.textContent = '';
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      // Denied, dismissed, or no microphone. Say which, and leave the other two
      // ways to answer sitting right above.
      status.textContent = e?.name === 'NotAllowedError'
        ? 'Your browser blocked the microphone. Allow it in the address bar, or use one of the other two options above.'
        : 'No microphone found. Upload a recording or type your answers instead.';
      status.className = 'hi-rec-status is-error';
      return;
    }

    const mimeType = pickRecordType();
    const rec = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: RECORD_BITRATE });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    rec.onstop = async () => {
      clearInterval(state.rec.interval);
      stream.getTracks().forEach((t) => t.stop());
      const durationSec = (Date.now() - state.rec.startedAt) / 1000;
      const abandoned = state.rec.abandoned;
      state.rec.active = false;
      state.rec.abandoned = false;

      // Navigated away mid-take. The mic is released above; there is nothing
      // to upload and no screen left to report to.
      if (abandoned) return;

      const blob = new Blob(chunks, { type: mimeType });

      // A recording can come back empty — a muted or disconnected input, or a
      // browser that handed over a live-looking track producing no audio. Catch
      // it here, because falling through to the upload validator tells someone
      // who just recorded for five minutes to "try picking the file again",
      // which is upload language and means nothing to them.
      if (!blob.size) {
        btn.disabled = false;
        btn.querySelector('.hi-rec-btn-label').textContent = 'Start recording';
        timer.textContent = '0:00';
        status.className = 'hi-rec-status is-error';
        status.textContent = 'That recording came out silent. Check your microphone is on and not muted, then try again — or use one of the other two options above.';
        return;
      }

      const file = new File([blob], `recording.${extensionForType(mimeType)}`, { type: mimeType });
      file.__durationSec = durationSec;

      btn.disabled = true;
      btn.querySelector('.hi-rec-btn-label').textContent = 'Saving…';
      status.className = 'hi-rec-status';
      status.textContent = 'Uploading and transcribing — this takes a few seconds.';
      wrap.classList.remove('is-recording');

      try {
        const out = await uploadFile(RECORDING_FIELD, file, (r) => {
          status.textContent = r < 1 ? `Uploading… ${Math.round(r * 100)}%` : 'Transcribing…';
        });
        state.uploads[RECORDING_FIELD] = [out.file];
        state.transcript = out.transcript || null;
        // Play back from the blob still in memory rather than re-fetching what
        // we just uploaded — it is instant, and it works before the signed URL
        // has been anywhere near the network.
        releaseBlobUrl();
        state.recBlobUrl = URL.createObjectURL(blob);
        refreshRail();
        render();
      } catch (e) {
        btn.disabled = false;
        btn.querySelector('.hi-rec-btn-label').textContent = 'Start recording';
        status.className = 'hi-rec-status is-error';
        status.textContent = e.message;
      }
    };

    // A timeslice means chunks arrive as it goes, so a tab that dies mid-way
    // has not necessarily lost everything the browser had buffered.
    rec.start(1000);
    // The stream is held on state so abandonRecording() can release the mic
    // from outside this closure.
    state.rec = {
      active: true, abandoned: false, startedAt: Date.now(),
      recorder: rec, stream, interval: setInterval(tick, 250),
    };
    wrap.classList.add('is-recording');
    btn.classList.add('is-recording');
    btn.querySelector('.hi-rec-btn-label').textContent = 'Stop recording';
    status.textContent = 'Recording. Work down the list — take your time.';
  }

  function stopRecording() {
    if (!state.rec.active) return;
    try { state.rec.recorder.stop(); } catch { /* already stopped */ }
  }

  return wrap;
}

// --- navigation ------------------------------------------------------------

function pager() {
  const bar = el('div', 'hi-pager');
  const order = SCREENS();
  const i = order.indexOf(state.screen);

  if (i > 0) {
    const back = el('button', 'btn-secondary hi-back');
    back.type = 'button';
    back.append(el('span', 'btn-arrow', '←'));
    back.append(document.createTextNode(' Back'));
    back.addEventListener('click', () => go(order[i - 1]));
    bar.append(back);
  } else {
    bar.append(el('span'));
  }

  if (state.screen !== 'review') {
    const next = el('button', 'btn-primary hi-next');
    next.type = 'button';
    next.append(document.createTextNode(state.screen === 'welcome' ? 'Start ' : 'Next '));
    next.append(el('span', 'btn-arrow', '→'));
    next.addEventListener('click', () => go(order[i + 1]));
    bar.append(next);
  }
  return bar;
}

function go(screen) {
  // Leaving the page mid-recording must not leave the microphone live. Without
  // this the recorder keeps running, the tracks are never released, and the
  // client keeps a recording indicator for up to RECORD_MAX_SECONDS with no
  // recorder visible anywhere.
  abandonRecording();
  state.screen = screen;
  state.lastScreen = screen;
  state.showMissing = false;
  state.serverMissing = [];
  // Reserved keys, not questions — session.js allows exactly these two.
  stage('__screen', screen);
  flush();
  render();
}

// Stop and release, without the upload that a deliberate stop triggers.
function abandonRecording() {
  if (!state.rec.active) return;
  state.rec.abandoned = true;
  state.rec.active = false;
  clearInterval(state.rec.interval);
  try { state.rec.recorder?.stop(); } catch { /* already stopped */ }
  state.rec.stream?.getTracks().forEach((t) => t.stop());
}

// Repaint only the rail's counts, so typing doesn't rebuild the field you are
// typing into and steal the caret.
function refreshRail() {
  const old = document.querySelector('.hi-rail');
  if (!old) return;
  old.replaceWith(rail());
  paintSaveState();
}

// Keep the rail honest while typing without re-rendering the field.
document.addEventListener('input', (e) => {
  if (e.target.closest?.('.hi-field')) refreshRail();
});

// --- submit ----------------------------------------------------------------

async function submit(button) {
  await flush();

  const missing = missingRequired();
  if (missing.length) {
    state.showMissing = true;
    render();
    document.querySelector('.hi-warn')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  button.disabled = true;
  button.textContent = 'Sending…';

  try {
    const res = await fetch(`${API}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Handled-Token': state.token },
    });
    const body = await res.json().catch(() => ({}));

    if (res.status === 422) {
      // Trust the server's list over our own. If the two disagree — a stale
      // questions.js in a long-open tab, or an autosave that never landed —
      // recomputing locally finds nothing and the client is left staring at a
      // button that silently does nothing.
      state.serverMissing = Array.isArray(body.missing) ? body.missing : [];
      state.showMissing = true;
      render();
      document.querySelector('.hi-warn')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!res.ok) throw new Error(body.error || String(res.status));

    state.status = 'submitted';
    state.screen = 'done';
    render();
  } catch {
    button.disabled = false;
    button.textContent = 'Send it to Shane →';
    const err = el('p', 'hi-send-error', 'That didn’t go through. Your answers are safe — try again in a moment.');
    err.setAttribute('role', 'alert');
    button.after(err);
  }
}

// --- fatal states ----------------------------------------------------------
// A bad link gets a sentence and an address, never a stack trace.

function renderFatal(kind) {
  const copy = {
    no_token: {
      title: 'This link is missing its key.',
      body: 'Open the intake from the link in your email — the whole link, including the part after the #. Copying just the first half drops the key.',
    },
    invalid_link: {
      title: 'This link doesn’t work.',
      body: 'It may have been mistyped, or it may have been replaced by a newer one. Email me and I’ll send a fresh link straight away.',
    },
    expired_link: {
      title: 'This link has expired.',
      body: 'Links stay open for a few weeks. Email me and I’ll issue a new one — nothing you filled in is lost.',
    },
    offline: {
      title: 'Couldn’t reach the server.',
      body: 'Check your connection and reload. Anything you had already filled in is saved.',
    },
  }[kind] || {
    title: 'Something went wrong.',
    body: 'Email me and I’ll sort it out.',
  };

  root.dataset.state = 'fatal';
  root.innerHTML = '';
  const sec = el('section', 'om-hero');
  const c = el('div', 'container');
  c.append(el('span', 'section-eyebrow', 'Handled'));
  c.append(el('h1', 'cs-hook', copy.title));
  c.append(el('p', 'om-lede', copy.body));
  const p = el('p', 'hi-reassure');
  const a = el('a', '', CONFIRMATION.contact);
  a.href = 'mailto:' + CONFIRMATION.contact;
  p.append(a);
  c.append(p);
  sec.append(c);
  root.append(sec);
}

// --- tiny helpers ----------------------------------------------------------

// An object URL pins the blob in memory until it is revoked, and a client who
// re-records a few times would otherwise hold every attempt.
function releaseBlobUrl() {
  if (state.recBlobUrl) URL.revokeObjectURL(state.recBlobUrl);
  state.recBlobUrl = null;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
