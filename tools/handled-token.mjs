#!/usr/bin/env node
/**
 * Issue a Handled intake link.
 *
 *   node tools/handled-token.mjs --label "Acme Plumbing"
 *   node tools/handled-token.mjs --label "Friend build (waived)" --days 90
 *   node tools/handled-token.mjs --label "Acme" --base https://shanegring.com
 *
 * Talks to POST /api/handled/issue, so it works identically against the local
 * dev server and production — there is no second code path that only runs on
 * someone's laptop. Defaults to the local server precisely so that issuing a
 * live link is something you have to type on purpose.
 *
 * The admin secret comes from HANDLED_ADMIN_SECRET in the environment, or from
 * .dev.vars for local runs (which is gitignored). It is never passed on the
 * command line, where it would land in shell history.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#![^\n]*\n/, ''));
  process.exit(0);
}

const base = (args.base || 'http://127.0.0.1:8788').replace(/\/$/, '');
const secret = process.env.HANDLED_ADMIN_SECRET || fromDevVars('HANDLED_ADMIN_SECRET');

if (!secret) {
  fail(
    'No HANDLED_ADMIN_SECRET found.\n' +
    'For local runs, add a line to .dev.vars (gitignored):\n' +
    '  HANDLED_ADMIN_SECRET="' + suggestSecret() + '"\n' +
    'For production, export it in your shell instead.'
  );
}
// --reset puts an existing link back to a blank form, keeping the same URL.
if (args.reset) {
  const token = args.reset === true ? '' : String(args.reset);
  const r = await fetch(base + '/api/handled/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Handled-Admin': secret },
    body: JSON.stringify({ token }),
  }).catch((e) => fail(`Could not reach ${base} — is the dev server running?\n  ${e.message}`));

  const b = await r.json().catch(() => null);
  if (!r.ok) fail(`${base} said ${r.status}: ${b?.error || '(no message)'}`);

  console.log('');
  console.log('  Link reset to a blank form');
  console.log('  ─────────────────────────────────────────────');
  console.log('  For       ' + (b.label || '(no label)'));
  console.log('  Was       ' + b.was);
  console.log('  The URL is unchanged — anything already sent still works.');
  console.log('');
  process.exit(0);
}

if (!args.label) fail('A --label is required. It is our own note about who this link went to, and the client never sees it.');

const res = await fetch(base + '/api/handled/issue', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Handled-Admin': secret },
  body: JSON.stringify({ label: args.label, ttlDays: args.days ? Number(args.days) : undefined }),
}).catch((e) => fail(`Could not reach ${base} — is the dev server running?\n  ${e.message}`));

const body = await res.json().catch(() => null);
if (!res.ok) fail(`${base} said ${res.status}: ${body?.error || '(no message)'}`);

const expires = new Date(body.expiresAt);
console.log('');
console.log('  Handled intake link issued');
console.log('  ─────────────────────────────────────────────');
console.log('  For      ' + body.label);
console.log('  Expires  ' + expires.toISOString().slice(0, 10) + `  (${Math.round((expires - Date.now()) / 86400000)} days)`);
console.log('');
console.log('  ' + body.url);
console.log('');
console.log('  Send that link. It is the only copy — the token is stored hashed,');
console.log('  so it cannot be recovered from storage if it is lost. Re-issue instead.');
console.log('');

// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') out.help = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = true;
    }
  }
  return out;
}

function fromDevVars(key) {
  const p = resolve(ROOT, '.dev.vars');
  if (!existsSync(p)) return '';
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = new RegExp('^\\s*' + key + '\\s*=\\s*(.*)$').exec(line);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

function suggestSecret() {
  return [...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fail(msg) {
  console.error('\n  ' + String(msg).split('\n').join('\n  ') + '\n');
  process.exit(1);
}
