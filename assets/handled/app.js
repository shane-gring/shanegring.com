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

import { SECTIONS, WELCOME, CONFIRMATION, questionById } from './questions.js?v=6621bbb0';
import { TEMPLATES, PLACEHOLDER_PREVIEW, templateBlurb, templateById } from './templates.js?v=c6787910';
import { acceptAttr, formatBytes } from './uploads.js?v=77cbd9e5';

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
  save: { phase: 'idle', at: null, pending: 0 },
  showMissing: false,         // only after a blocked submit — never pre-emptively
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
  for (const s of SECTIONS) {
    const { answered, total } = sectionProgress(s);
    if (answered < total) return s.id;
  }
  return 'review';
}

// --- persistence -----------------------------------------------------------

const queue = new Map();
let saveTimer = null;

function stage(id, value) {
  queue.set(id, value);
  state.save.phase = 'pending';
  paintSaveState();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
}

async function flush() {
  if (!queue.size || state.status === 'submitted') return;
  const patch = Object.fromEntries(queue);
  queue.clear();

  state.save.phase = 'saving';
  state.save.pending++;
  paintSaveState();

  try {
    const res = await fetch(`${API}/session`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Handled-Token': state.token },
      body: JSON.stringify(patch),
    });
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
    state.save.pending--;
    paintSaveState();
  }
}

// A last-chance save when the tab goes away. Not a guarantee, just a courtesy
// on top of the debounce — which is short enough that this rarely has work.
addEventListener('hashchange', () => {
  if (readToken() === state.token) return;
  queue.clear();
  clearTimeout(saveTimer);
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

const missingRequired = () =>
  SECTIONS.flatMap((s) => s.questions.filter((q) => q.required && !answered(q)).map((q) => ({ ...q, sectionId: s.id })));

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

  if (section.video) wrap.append(videoChooser(section));

  const fields = el('div', 'hi-fields');
  fields.id = 'hi-fields';
  for (const q of section.questions) fields.append(field({ ...q, sectionId: section.id }));
  wrap.append(fields);
  return wrap;
}

// Three ways to answer the same five prompts, presented as equals. The typed
// path is not a fallback: plenty of people will not put themselves on camera,
// and their answers are worth exactly as much.
function videoChooser(section) {
  const wrap = el('div', 'hi-ways');
  const modes = [
    { id: 'record', label: 'Record here', note: 'Prompts on screen, five minutes' },
    { id: 'upload', label: 'Upload a video', note: 'Use your own camera app' },
    { id: 'type',   label: 'Type it instead', note: 'Answer in writing' },
  ];
  const current = state.answers.__video_mode || 'type';

  const row = el('div', 'hi-ways-row');
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-label', 'How would you like to answer?');

  for (const m of modes) {
    const b = el('button', 'hi-way');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(m.id === current));
    if (m.id === current) b.classList.add('is-on');
    b.append(el('span', 'hi-way-label', m.label));
    b.append(el('span', 'hi-way-note', m.note));

    if (m.id !== 'type') {
      b.disabled = true;
      b.classList.add('is-pending');
      b.append(el('span', 'hi-way-soon', 'Not wired yet'));
    } else {
      b.addEventListener('click', () => { state.answers.__video_mode = m.id; render(); });
    }
    row.append(b);
  }
  wrap.append(row);
  wrap.append(el('p', 'hi-ways-note',
    'Recording and video upload land in the next pass. Typed answers below are live and saving.'));
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
    case 'text-or-file':     wrap.append(uploadStub(q)); break;
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

// Pass 1 placeholder. The real control (presigned PUT straight to R2, per-file
// progress, remove and re-upload) lands in Pass 2. It says what it is rather
// than pretending to work.
function uploadStub(q) {
  const wrap = el('div', 'hi-upload is-pending');
  const box = el('div', 'hi-upload-box');
  box.append(el('span', 'hi-upload-icon', '↑'));
  box.append(el('span', 'hi-upload-text', q.type === 'files' ? 'Add files' : 'Add a file'));
  box.append(el('span', 'hi-upload-soon', 'Uploads land in the next pass'));
  box.setAttribute('aria-disabled', 'true');
  box.title = 'Accepts ' + acceptAttr(q.accept || 'image').split(',').filter((s) => s.startsWith('.')).join(' ');
  wrap.append(box);

  if (q.type === 'text-or-file') {
    const or = el('p', 'hi-upload-or', 'Or paste it here — this part works now:');
    wrap.append(or);
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
  flush();
  state.screen = screen;
  state.showMissing = false;
  render();
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
      state.showMissing = true;
      render();
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

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
