#!/usr/bin/env node
/**
 * Rewrites the <a class="announce-bar"> block in every tracked HTML file from
 * the single copy in tools/chrome.mjs.
 *
 *   node tools/sync-announce.mjs
 *   node tools/sync-announce.mjs --dry-run    # list what would change
 *
 * The sibling of sync-nav.mjs, and it exists for the same reason: /blog and
 * /notes are generated and pick the bar up from chrome.mjs already, while the
 * ~95 hand-written pages each carried their own copy. The bar is one line of
 * site-wide copy, so a partial sweep leaves the old promotion live on
 * whichever pages got missed.
 *
 * Same narrowness as sync-nav.mjs: it replaces the anchor and nothing else,
 * and it refuses to touch a file where the block does not match exactly once.
 * A page with no bar (a bare landing page, the proposal gate) is reported and
 * left alone rather than having one inserted at a guessed position.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANNOUNCE } from './chrome.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRY_RUN = process.argv.slice(2).includes('--dry-run');

const BLOCK = /<a class="announce-bar"[\s\S]*?<\/a>/g;

const files = execFileSync('git', ['ls-files', '*.html'], { cwd: ROOT })
  .toString()
  .trim()
  .split('\n')
  .filter(Boolean);

let changed = 0;
let same = 0;
const skipped = [];

for (const rel of files) {
  const path = resolve(ROOT, rel);
  const html = readFileSync(path, 'utf8');
  const hits = html.match(BLOCK);

  // Zero means the page has no bar; more than one means something about this
  // page is not what this script assumes. Either way, do not guess.
  if (!hits || hits.length !== 1) {
    skipped.push(`${rel} (${hits ? hits.length : 0} announce blocks)`);
    continue;
  }

  if (hits[0] === ANNOUNCE) {
    same += 1;
    continue;
  }

  if (!DRY_RUN) writeFileSync(path, html.replace(BLOCK, () => ANNOUNCE));
  console.log(`  ${DRY_RUN ? 'would update' : 'updated'} ${rel}`);
  changed += 1;
}

console.log(
  `\n${changed} ${DRY_RUN ? 'to update' : 'updated'}, ${same} already current` +
    (skipped.length ? `, ${skipped.length} skipped` : '')
);
for (const s of skipped) console.log(`  skipped ${s}`);
