#!/usr/bin/env node
/**
 * Tells IndexNow which URLs changed, so Bing crawls them in minutes rather
 * than whenever it next comes round. Bing feeds ChatGPT's search results, so
 * this is the shortest path from publishing an issue to it being quotable.
 *
 *   node tools/indexnow.mjs --from-git        # URLs touched by the last commit
 *   node tools/indexnow.mjs --urls /blog/,/x  # explicit paths
 *   node tools/indexnow.mjs --from-git --dry-run
 *
 * There is no secret here. IndexNow proves you own the domain by having you
 * host a key file at the site root; anyone can read it, and that is the
 * design. The key is read back out of that file rather than duplicated in
 * this script, so the two can never drift apart.
 *
 * Submitting URLs that did not change is explicitly discouraged by the
 * protocol, which is why this works from the commit rather than just posting
 * the whole sitemap every run.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://shanegring.com';
const HOST = 'shanegring.com';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

function findKey() {
  // The key file is named for its own contents: <key>.txt containing <key>.
  const file = readdirSync(ROOT).find((f) => /^[0-9a-f]{8,128}\.txt$/.test(f));
  if (!file) {
    console.error('No IndexNow key file at the repo root. Expected <key>.txt.');
    process.exit(1);
  }
  const key = readFileSync(resolve(ROOT, file), 'utf8').trim();
  if (file !== `${key}.txt`) {
    console.error(`Key file ${file} does not contain its own name — IndexNow will reject it.`);
    process.exit(1);
  }
  return key;
}

/**
 * A path on disk is not a URL. Pages are served without .html and index.html
 * is served as the directory, which is how every link on the site is written.
 * Submitting the .html form would ask Bing to index a URL nothing points at.
 */
function pathToUrl(file) {
  if (!file.endsWith('.html')) return null;
  if (isNoindex(file)) return null;
  let p = file.replace(/index\.html$/, '').replace(/\.html$/, '');
  return `${SITE}/${p}`.replace(/([^:])\/\/+/g, '$1/');
}

/**
 * A page that tells search engines not to index it must not then be announced
 * to them. Two pages on this site are noindex — the Read intake and the Handled
 * intake — and both are private, token-reached pages whose URLs have no
 * business being pushed to Bing the moment a stylesheet hash changes them.
 *
 * Read from disk rather than kept as a list, so a page added later is covered
 * by writing the same meta tag it would need anyway.
 */
function isNoindex(file) {
  try {
    const html = readFileSync(resolve(ROOT, file), 'utf8').slice(0, 4000);
    return /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html);
  } catch {
    // Deleted in this commit, most likely. Nothing to submit either way.
    return true;
  }
}

function fromGit() {
  let out;
  try {
    out = execSync('git diff --name-only HEAD~1 HEAD', { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    // A shallow clone has no parent commit to diff against. Say so rather
    // than submitting nothing quietly, because "nothing changed" and "I
    // could not tell what changed" look identical from the outside.
    console.error('Could not read the previous commit — is this a shallow clone? Nothing submitted.');
    process.exit(0);
  }
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(pathToUrl)
    .filter(Boolean);
}

let urls = [];
const explicit = args.find((a) => a.startsWith('--urls='));
if (explicit) {
  urls = explicit
    .slice('--urls='.length)
    .split(',')
    .map((p) => (p.startsWith('http') ? p : `${SITE}${p.startsWith('/') ? '' : '/'}${p}`));
} else if (args.includes('--from-git')) {
  urls = fromGit();
} else {
  console.error('Pass --from-git or --urls=/a,/b');
  process.exit(1);
}

urls = [...new Set(urls)];

if (!urls.length) {
  console.log('Nothing changed that is worth submitting.');
  process.exit(0);
}

const key = findKey();
console.log(`${urls.length} URL(s):`);
for (const u of urls) console.log(`  ${u}`);

if (DRY_RUN) {
  console.log('\nDry run: nothing submitted.');
  process.exit(0);
}

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: HOST,
    key,
    keyLocation: `${SITE}/${key}.txt`,
    urlList: urls,
  }),
});

// 200 accepted, 202 accepted but key still being validated. Anything else is
// worth printing, but never worth failing a deploy over: IndexNow is a hint,
// and the sitemap still carries these URLs.
const body = await res.text();
console.log(`\nIndexNow responded ${res.status}${body ? ' ' + body.slice(0, 200) : ''}`);
if (res.status !== 200 && res.status !== 202) {
  console.log('Not fatal — the sitemap still lists these URLs for the next crawl.');
}
