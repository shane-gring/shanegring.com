#!/usr/bin/env node
/**
 * Stamps a content hash onto the stylesheet and script URLs in every page.
 *
 *   node tools/version-assets.mjs [--check]
 *
 * Pages serves HTML with max-age=0 but static assets with a four-hour cache,
 * and Cloudflare ignores Cache-Control set in _headers for those assets (this
 * was measured, not assumed). So a returning visitor can hold a brand-new
 * page against a four-hour-old stylesheet. That already caused a real bug: an
 * off-screen honeypot field rendered as an empty box in the middle of the
 * signup form, because the rule hiding it lived only in the stylesheet.
 *
 * Adding ?v=<hash> to the URL makes the asset a different URL whenever its
 * contents change, so fresh HTML can never ask for a stale copy. The query
 * string does not affect how Pages serves the file.
 *
 * This runs in CI before deploy (.github/workflows/deploy.yml), so it cannot
 * be forgotten after a CSS edit. --check reports what would change without
 * writing, and exits non-zero if anything is stale.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

// Only assets that are referenced from a plain, unversioned path in the HTML.
const ASSETS = ['styles.css', 'nav.js', 'track.js', 'subscribe.js'];

function shortHash(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8);
}

let touched = 0;
const stale = [];

const versions = new Map();
for (const asset of ASSETS) {
  const path = resolve(ROOT, asset);
  if (existsSync(path)) versions.set(asset, shortHash(path));
}

// ---------------------------------------------------------------------------
// The Handled intake module graph.
//
// Same cache problem, one level deeper. /handled-intake loads an ES module,
// which imports its config (questions.js, templates.js, uploads.js) by a
// relative path the loop above never sees. The whole point of that config is
// that Chris and Shane edit it without touching code — so a four-hour stale
// copy would mean a reworded question silently not appearing, which is worse
// than the stylesheet bug this tool was written for.
//
// Order matters: stamp the leaf imports inside app.js first, then hash app.js
// (its contents just changed), then let the loop above stamp app.js in the
// HTML. Only the browser-side import sites are touched — the Pages Functions
// import the same config by relative path and are bundled at build time, where
// a ?v= query would break resolution.
// ---------------------------------------------------------------------------

const HANDLED_DIR = 'assets/handled';
const HANDLED_APP = `${HANDLED_DIR}/app.js`;
const HANDLED_CONFIG = ['questions.js', 'templates.js', 'uploads.js'];

const appPath = resolve(ROOT, HANDLED_APP);
if (existsSync(appPath)) {
  const before = readFileSync(appPath, 'utf8');
  let after = before;

  for (const mod of HANDLED_CONFIG) {
    const modPath = resolve(ROOT, HANDLED_DIR, mod);
    if (!existsSync(modPath)) continue;
    const hash = shortHash(modPath);
    const re = new RegExp(`(from\\s+['"]\\./)${mod.replace('.', '\\.')}(?:\\?v=[a-f0-9]+)?(['"])`, 'g');
    after = after.replace(re, `$1${mod}?v=${hash}$2`);
    console.log(`  ${HANDLED_DIR}/${mod} -> ?v=${hash}`);
  }

  if (after !== before) {
    stale.push(relative(ROOT, appPath));
    if (!CHECK) writeFileSync(appPath, after);
    touched += 1;
  }
}

if (existsSync(appPath)) versions.set(HANDLED_APP, shortHash(appPath));

const pages = globSync('**/*.html', { cwd: ROOT })
  .filter((p) => !p.startsWith('node_modules/') && !p.includes('/node_modules/'))
  .map((p) => resolve(ROOT, p));

for (const page of pages) {
  const before = readFileSync(page, 'utf8');
  let after = before;

  for (const [asset, hash] of versions) {
    // Matches /asset, /asset?v=anything — anchored on the quote so a longer
    // filename sharing a prefix cannot be caught by accident.
    const re = new RegExp(`(["'])/${asset.replace(/\./g, '\\.')}(?:\\?v=[a-f0-9]+)?\\1`, 'g');
    after = after.replace(re, `$1/${asset}?v=${hash}$1`);
  }

  if (after !== before) {
    stale.push(relative(ROOT, page));
    if (!CHECK) writeFileSync(page, after);
    touched += 1;
  }
}

for (const [asset, hash] of versions) console.log(`  ${asset} -> ?v=${hash}`);

if (CHECK) {
  if (touched) {
    console.log(`\n${touched} page(s) reference a stale asset version:`);
    for (const p of stale.slice(0, 10)) console.log(`  ${p}`);
    if (stale.length > 10) console.log(`  ...and ${stale.length - 10} more`);
    process.exit(1);
  }
  console.log('\nAll pages reference current asset versions.');
} else {
  console.log(`\n${touched} page(s) updated, ${pages.length} scanned.`);
}
