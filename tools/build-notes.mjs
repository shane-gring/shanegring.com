#!/usr/bin/env node
/**
 * Builds /notes from the LinkedIn posts in notes/_data/posts.json, and
 * refreshes the "Lately" strip on the homepage.
 *
 *   node tools/build-notes.mjs
 *
 * Source of truth is Ordinal, which is where these are written and scheduled
 * from. Reading them there rather than from LinkedIn matters: LinkedIn has no
 * public API for your own posts and no feed, and scraping it breaks their
 * terms. Ordinal has the copy, the dates, the labels and the images, and it
 * is Shane's own account.
 *
 * The whole archive is one page rather than a page per post. At a weekday
 * cadence that is ~250 posts a year; as individual URLs that is 250 thin
 * pages competing with the guides and the newsletter for the same attention.
 * As one page it reads the way a feed is meant to be read.
 *
 * Ordinal does not store the LinkedIn permalink, so individual posts cannot
 * link back to the original — only the profile can.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GTM_HEAD, GTM_BODY, LINKEDIN_HEAD, ANNOUNCE, NAV, footerHtml, subscribeForm, esc,
} from './chrome.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = resolve(ROOT, 'notes/_data/posts.json');
const OUT = resolve(ROOT, 'notes');
const SITE = 'https://shanegring.com';
const LINKEDIN = 'https://www.linkedin.com/in/shanegring/';

// Permalinks and engagement come from Ordinal's analytics endpoint, kept in
// their own file so refreshing them does not mean rewriting every post body.
const LINKEDIN_DATA = resolve(ROOT, 'notes/_data/linkedin.json');
const meta = JSON.parse(readFileSync(LINKEDIN_DATA, 'utf8'));

const posts = JSON.parse(readFileSync(DATA, 'utf8')).sort((a, b) =>
  b.date === a.date ? 0 : b.date < a.date ? -1 : 1
);

const longDate = (d) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });

const shortDate = (d) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  });

/**
 * A LinkedIn post is plain text with blank lines between paragraphs. Turning
 * that into markup means paragraphs, and nothing else — no headings to infer,
 * no lists to guess at. Bare URLs are linked, because Shane writes them as
 * shanegring.com/guides/x rather than as anchors, and an unlinked link on a
 * web page is just friction.
 */
function toParagraphs(copy) {
  return copy
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const html = esc(block)
        .replace(/\n/g, '<br>')
        // Match bare domains as well as full URLs; anchor on shanegring.com so
        // a stray sentence containing a full stop is not turned into a link.
        .replace(
          /\b((?:https?:\/\/)?shanegring\.com\/[^\s<),]*)/g,
          (m) => `<a href="${m.startsWith('http') ? m : 'https://' + m}">${m}</a>`
        );
      return `        <p>${html}</p>`;
    })
    .join('\n');
}

/**
 * The homepage rail runs the same copy through a plainer converter: no
 * links. The whole card is an anchor to /notes, and an anchor inside an
 * anchor is invalid markup that browsers resolve by silently closing the
 * outer one — half the card would stop being clickable.
 */
function toPlainParagraphs(copy, indent) {
  return copy
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `${indent}<p>${esc(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/**
 * Each note is presented the way it was published: a post, with the byline
 * and the counts it actually earned.
 *
 * The counts are real, read from Ordinal's analytics, and a post with none
 * shows none rather than a row of zeroes. Nothing here is invented, because
 * a fabricated like count is a fabricated fact however small it looks.
 *
 * This deliberately stops short of reproducing LinkedIn's own interface.
 * There are no working reaction buttons and no LinkedIn logo: the reader is
 * on shanegring.com, with its nav and its footer, reading a post that links
 * out to the original. Looking like a post is the point; looking like you
 * are on LinkedIn is not.
 */
function noteArticle(p) {
  const li = meta[p.id];
  const url = li ? `https://www.linkedin.com/feed/update/urn:li:${li.urn}` : null;

  const art = p.images
    .map(
      (i) =>
        `          <img class="note-art" src="/images/notes/${i.asset}.jpg" alt="" width="${i.w}" height="${i.h}" loading="lazy">`
    )
    .join('\n');

  const counts = [];
  if (li?.likes) counts.push(`${li.likes} ${li.likes === 1 ? 'reaction' : 'reactions'}`);
  if (li?.comments) counts.push(`${li.comments} ${li.comments === 1 ? 'comment' : 'comments'}`);

  const footer = url
    ? `\n        <p class="note-foot">${
        counts.length ? `<span class="note-counts">${counts.join(' &middot; ')}</span>` : ''
      }<a href="${url}" target="_blank" rel="noopener noreferrer">View on LinkedIn</a></p>`
    : '';

  const labels = p.labels.length
    ? `\n        <p class="note-labels">${p.labels.map((l) => `<span>${esc(l)}</span>`).join('')}</p>`
    : '';

  return `      <article class="note" id="${p.id.slice(0, 8)}">
        <header class="note-head">
          <img class="note-avatar" src="/images/notes/avatar.jpg" alt="" width="48" height="48" loading="lazy">
          <span class="note-who">
            <span class="note-name">Shane Gring</span>
            <span class="note-role">Fractional COO &middot; operations for expert-led businesses</span>
            <span class="note-when"><time datetime="${p.date}">${longDate(p.date)}</time></span>
          </span>
        </header>
        <div class="note-body">
${toParagraphs(p.copy)}
${art}
        </div>${footer}${labels}
      </article>`;
}

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

const graph = posts
  .slice(0, 20)
  .map(
    (p) =>
      `{"@type":"SocialMediaPosting","headline":${JSON.stringify(p.title)},"datePublished":"${p.date}","author":{"@id":"${SITE}/#person"},"url":"${SITE}/notes/#${p.id.slice(0, 8)}"}`
  )
  .join(',\n');

const page = `<!DOCTYPE html>
<html lang="en">
<head>
${GTM_HEAD}
${LINKEDIN_HEAD}

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Notes: what I'm posting most weekdays | Shane Gring</title>
<meta name="description" content="Short notes on running and rebuilding businesses — websites as operations, getting the founder's judgment out of their head, and what I keep seeing inside expert-led companies. Posted most weekdays.">
<meta name="author" content="Shane Gring">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${SITE}/notes/">

<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="alternate icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<meta name="theme-color" content="#ffffff">

<meta property="og:type" content="website">
<meta property="og:title" content="Notes: what I'm posting most weekdays">
<meta property="og:description" content="Short notes on running and rebuilding businesses, posted most weekdays.">
<meta property="og:url" content="${SITE}/notes/">
<meta property="og:site_name" content="Shane Gring">
<meta property="og:image" content="${SITE}/og-social.png">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Notes | Shane Gring">
<meta name="twitter:description" content="Short notes on running and rebuilding businesses, posted most weekdays.">
<meta name="twitter:image" content="${SITE}/og-social.png">

<link rel="stylesheet" href="/styles.css">
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
{"@type":"CollectionPage","@id":"${SITE}/notes/#page","name":"Notes","description":"Short notes on running and rebuilding businesses, posted most weekdays.","url":"${SITE}/notes/","author":{"@id":"${SITE}/#person"},"hasPart":[
${graph}]},
{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"${SITE}/"},{"@type":"ListItem","position":2,"name":"Notes","item":"${SITE}/notes/"}]}]}
</script>
</head>

<body>
${GTM_BODY}

<!--
  Generated by tools/build-notes.mjs from notes/_data/posts.json.
  Do not hand-edit: the next build overwrites this file.
-->

${ANNOUNCE}

${NAV}

<main>
  <section class="om-hero">
    <div class="container">
      <span class="section-eyebrow">Notes &middot; ${posts.length} of them</span>
      <h1 class="cs-hook">What I'm working through, most weekdays.</h1>

      <p class="om-lede">
        Short pieces I post as I go — what I'm seeing inside expert-led
        businesses, what broke, what I'd do differently.
        <strong>The guides are the worked answers; these are the thinking
        on the way there.</strong> Also on
        <a href="${LINKEDIN}" target="_blank" rel="noopener noreferrer">LinkedIn</a>,
        which is where they start.
      </p>
    </div>
  </section>

  <section class="om-section">
    <div class="container notes-list">
${posts.map(noteArticle).join('\n\n')}
    </div>
  </section>

  <section class="om-section om-investment">
    <div class="container">
      <h2 class="cs-section-title">These usually start as something I ran into</h2>

      <p class="guide-cta-line">
        If one of them sounds like your week, <strong>the Scan is the fastest
        way to get a read on where you stand</strong> — free, about half a
        minute.
      </p>

      <a class="btn-primary" href="/scan">
        Run the free Scan <span class="btn-arrow">&rarr;</span>
      </a>
    </div>
  </section>
</main>

${footerHtml()}
`;

mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, 'index.html'), page);
console.log(`  /notes/  (${posts.length} notes)`);

/* ------------------------------------------------------------------ *
 * Homepage rail
 *
 * Replaces whatever sits between the two marker comments on the homepage,
 * so the strip is regenerated rather than maintained by hand. If the
 * markers are missing the homepage is left alone and this says so, rather
 * than guessing where the block belongs.
 *
 * The rail is the same post card as /notes, cut down: a shorter byline, the
 * opening of the copy, and "see more". Truncation is done in CSS rather than
 * by cutting the string here, so the card never breaks a sentence in a place
 * that changes its meaning, and the full text is in the page for anything
 * reading the markup rather than the render.
 *
 * "See more" goes to the post on /notes rather than expanding the card in
 * place. Expanding one card in a horizontal rail pushes every other card's
 * height and shifts the page under the reader's cursor; the link keeps the
 * rail a fixed size and sends the interested reader to the archive, which is
 * what a homepage strip is for.
 * ------------------------------------------------------------------ */

const RAIL_COUNT = 8;

const HOME = resolve(ROOT, 'index.html');
const START = '<!-- notes:start -->';
const END = '<!-- notes:end -->';

if (existsSync(HOME)) {
  const home = readFileSync(HOME, 'utf8');
  if (!home.includes(START) || !home.includes(END)) {
    console.log('  index.html: no notes markers found, homepage left alone');
  } else {
    const strip = posts
      .slice(0, RAIL_COUNT)
      .map((p) => {
        const li = meta[p.id];

        const counts = [];
        if (li?.likes) counts.push(`${li.likes} ${li.likes === 1 ? 'reaction' : 'reactions'}`);
        if (li?.comments) counts.push(`${li.comments} ${li.comments === 1 ? 'comment' : 'comments'}`);

        const art = p.images.length
          ? `\n            <img class="home-note-art" src="/images/notes/${p.images[0].asset}.jpg" alt="" width="${p.images[0].w}" height="${p.images[0].h}" loading="lazy">`
          : '';

        const foot = counts.length
          ? `\n            <span class="home-note-foot">${counts.join(' &middot; ')}</span>`
          : '';

        return `        <li>
          <a class="home-note" href="/notes/#${p.id.slice(0, 8)}">
            <span class="home-note-head">
              <img class="home-note-avatar" src="/images/notes/avatar.jpg" alt="" width="40" height="40" loading="lazy">
              <span class="home-note-who">
                <span class="home-note-name">Shane Gring</span>
                <span class="home-note-role">Fractional COO &middot; operations for expert-led businesses</span>
                <span class="home-note-when"><time datetime="${p.date}">${shortDate(p.date)}</time></span>
              </span>
            </span>
            <div class="home-note-copy">
${toPlainParagraphs(p.copy, '              ')}
            </div>
            <span class="home-note-more">&hellip;see more</span>${art}${foot}
          </a>
        </li>`;
      })
      .join('\n');

    // The homepage has its own section conventions (section-title, fade-in)
    // rather than the om- classes the generated sections use.
    const block = `${START}
<section class="home-notes fade-in">
  <div class="container">
    <span class="section-eyebrow">Lately</span>
    <h2 class="section-title">Notes from the work.</h2>
    <ul class="home-note-rail">
${strip}
    </ul>
    <a class="cs-back" href="/notes/">All ${posts.length} notes <span class="btn-arrow">&rarr;</span></a>
  </div>
</section>
${END}`;

    const next = home.replace(
      new RegExp(`${START}[\\s\\S]*?${END}`),
      () => block
    );
    writeFileSync(HOME, next);
    console.log('  index.html: Lately strip refreshed');
  }
}
