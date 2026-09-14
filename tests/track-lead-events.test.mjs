// Tests for track.js's generate_lead wiring: real completion signals only
// (Tally's postMessage submit event, Cal.com's bookingSuccessful callback),
// deduped per pageview. Runs the actual script in a vm sandbox standing in
// for window/document, since it's a plain browser IIFE, not a module.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = readFileSync(resolve(ROOT, 'track.js'), 'utf8');

function loadTrackJs() {
  const listeners = { message: [], click: [] };
  const sandbox = {
    window: {
      dataLayer: [],
      location: { pathname: '/contact' },
      addEventListener(type, handler) {
        (listeners[type] ||= []).push(handler);
      },
    },
    document: {
      addEventListener(type, handler) {
        (listeners[type] ||= []).push(handler);
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  return { sandbox, listeners };
}

function tallyMessage(formId) {
  return { data: JSON.stringify({ event: 'Tally.FormSubmitted', payload: { formId } }) };
}

test('Tally submit for a known form fires exactly one generate_lead', () => {
  const { sandbox, listeners } = loadTrackJs();
  for (const handler of listeners.message) handler(tallyMessage('MepBpY'));
  const leads = sandbox.window.dataLayer.filter((e) => e.event === 'generate_lead');
  assert.equal(leads.length, 1);
  assert.equal(leads[0].form_name, 'contact');
  assert.equal(leads[0].lead_source, 'contact_form');
});

test('duplicate Tally postMessages for the same form dedupe to one generate_lead', () => {
  const { sandbox, listeners } = loadTrackJs();
  for (const handler of listeners.message) handler(tallyMessage('yP5L50'));
  for (const handler of listeners.message) handler(tallyMessage('yP5L50'));
  for (const handler of listeners.message) handler(tallyMessage('yP5L50'));
  const leads = sandbox.window.dataLayer.filter((e) => e.event === 'generate_lead');
  assert.equal(leads.length, 1);
});

test('an unknown formId or non-Tally message never fires generate_lead', () => {
  const { sandbox, listeners } = loadTrackJs();
  for (const handler of listeners.message) handler(tallyMessage('unknown-form'));
  for (const handler of listeners.message) handler({ data: JSON.stringify({ event: 'Tally.PopupOpened', payload: {} }) });
  for (const handler of listeners.message) handler({ data: 'not json' });
  assert.equal(sandbox.window.dataLayer.filter((e) => e.event === 'generate_lead').length, 0);
});

test('sgTrackLeadOnce dedupes by key across independent callers (Cal.com bookingSuccessful)', () => {
  const { sandbox } = loadTrackJs();
  sandbox.window.sgTrackLeadOnce('cal_30min', { form_name: 'booking', lead_source: 'cal_booking', booking_type: '30min' });
  sandbox.window.sgTrackLeadOnce('cal_30min', { form_name: 'booking', lead_source: 'cal_booking', booking_type: '30min' });
  const leads = sandbox.window.dataLayer.filter((e) => e.event === 'generate_lead');
  assert.equal(leads.length, 1);
  assert.equal(leads[0].booking_type, '30min');
});

test('a booking-link click fires book_call_click, never generate_lead', () => {
  const { sandbox, listeners } = loadTrackJs();
  const closest = (sel) => (sel.indexOf('cal.com') !== -1 ? { getAttribute: () => 'https://cal.com/shane-gring/30min' } : null);
  for (const handler of listeners.click) handler({ target: { closest } });
  const dl = sandbox.window.dataLayer;
  assert.equal(dl.filter((e) => e.event === 'generate_lead').length, 0);
  assert.equal(dl.filter((e) => e.event === 'book_call_click').length, 1);
});
