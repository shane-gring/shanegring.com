#!/usr/bin/env node
/**
 * Builds /blog from beehiiv newsletter posts.
 *
 * Source of truth is blog/_data/posts.json. That file is written either by
 * hand or by tools/sync-beehiiv.mjs, which pulls it from the beehiiv API.
 * This script turns it into static pages that match the /guides design, so
 * the newsletter archive lives on shanegring.com rather than on a subdomain
 * and the ranking signal lands on the root domain.
 *
 *   node tools/build-blog.mjs
 *
 * Every page is regenerated from scratch on each run. Do not hand-edit
 * anything in blog/ except _data/posts.json — your edits will be erased.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GTM_HEAD, GTM_BODY, LINKEDIN_HEAD, ANNOUNCE, NAV, footerHtml, SUBSCRIBE_URL, subscribeForm, esc,
} from './chrome.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = resolve(ROOT, 'blog/_data/posts.json');
const NOTES = resolve(ROOT, 'blog/_data/notes.json');
const OUT = resolve(ROOT, 'blog');

const SITE = 'https://shanegring.com';
const PUB_NAME = 'Seeking Certainty';

/* ------------------------------------------------------------------ *
 * beehiiv markup -> site markup
 * ------------------------------------------------------------------ */

// beehiiv's editor_html carries a lot of editor bookkeeping. None of it
// means anything outside their editor, and some of it (inline font-weight,
// mobile font sizes) actively fights this site's stylesheet.
const NOISE_ATTRS = [
  /\s+xmlns="[^"]*"/g,
  /\s+data-node-hash="[^"]*"/g,
  /\s+data-anchor-[a-z-]+="[^"]*"/g,
  /\s+data-mobile-font-size="[^"]*"/g,
  /\s+data-id="[^"]*"/g,
  /\s+data-variant="[^"]*"/g,
  /\s+data-type="(?:quoteCaption|emoji)"/g,
  /\s+style="font-weight:\s*700;?"/g,
  /\s+class="link"/g,
];

function stripNoise(html) {
  let out = html;
  for (const re of NOISE_ATTRS) out = out.replace(re, '');
  return out;
}

/**
 * The API and the editor hand back different markup for the same post.
 *
 * tools/sync-beehiiv.mjs asks for free_rss_content, which arrives as a
 * `div.beehiiv` wrapper around semantic tags with beehiiv's own classes on
 * them. (free_web_content is the other option and is far worse: a complete
 * themed HTML document, scripts and byline and all, five times the size.)
 * The editor's own HTML, which seeded this file originally, uses different
 * conventions again.
 *
 * This reduces the RSS shape to the same plain tags the editor produces, so
 * everything downstream sees one input. It is a no-op on editor markup.
 */
function normalizeRss(html) {
  let h = html;

  // beehiiv ships a stylesheet for its table blocks inside the content.
  h = h.replace(/<style>[\s\S]*?<\/style>/g, '');

  // The publication logo, linked to certainly.coop, opens every issue.
  h = h.replace(/<div class=['"]image['"]>[\s\S]*?<\/div>/g, '');

  // "Powered by beehiiv", their footer link, and the spacer break that
  // closes every issue. beehiiv mixes single and double quotes in the same
  // document, so every attribute match here has to accept both.
  h = h.replace(/<[^>]*class=['"]beehiiv__footer_link['"][^>]*>[\s\S]*?<\/a>/g, '');
  h = h.replace(/<p[^>]*>\s*Powered by beehiiv\s*<\/p>/gi, '');
  h = h.replace(/<br[^>]*beehiiv__[^>]*>/g, '');

  // The two wrapper divs, plus any left over once their contents are gone.
  h = h.replace(/<\/?div[^>]*>/g, '');

  // beehiiv uses <b> where the editor uses <strong>. They render the same
  // but only one of them means anything.
  h = h.replace(/<(\/?)b>/g, '<$1strong>');

  h = h.replace(/<hr[^>]*class="content_break"[^>]*>/g, '<hr />');

  // Every link is rewritten with campaign tracking pointed back at the
  // beehiiv domain, which is not where these links now live.
  h = h.replace(/href="([^"]+)"/g, (_m, url) => {
    const clean = url
      .replace(/([?&])utm_[a-z_]+=[^&"]*/gi, '$1')
      .replace(/[?&]+$/, '')
      .replace(/\?&+/, '?')
      .replace(/&{2,}/g, '&');
    return `href="${clean}"`;
  });

  // Presentational leftovers: class hooks for beehiiv's stylesheet, inline
  // text-align, and heading ids generated for their own anchor links.
  h = h.replace(/\s+class=['"](?:paragraph|heading|image__\w+|link|content_break)['"]/g, '');
  h = h.replace(/\s+class=['"][^'"]*beehiiv[^'"]*['"]/g, '');
  h = h.replace(/\s+style=['"]\s*text-align:\s*(?:left|center|right)\s*;?\s*['"]/gi, '');
  h = h.replace(/\s+style=['"]['"]/g, '');
  h = h.replace(/<(h[1-6]|p)([^>]*)\s+id=['"][^'"]*['"]/g, '<$1$2');

  return h;
}

function convert(rawHtml) {
  let h = normalizeRss(rawHtml);

  // The publication logo is stamped at the top of every issue as an image
  // block. It is masthead furniture for the email, not part of the piece,
  // and the site already has its own header.
  h = h.replace(/<figure[^>]*data-type="imageBlock"[\s\S]*?<\/figure>/g, '');

  // Pull quotes: beehiiv wraps them in a figure with an always-empty
  // caption. The site's own pull quote is the same figure/blockquote shape
  // under .cs-quote, so this is a class swap and a dropped caption.
  h = h.replace(
    /<figure[^>]*data-type="blockquoteFigure"[^>]*>\s*<blockquote>([\s\S]*?)<\/blockquote>\s*<figcaption[^>]*>\s*<\/figcaption>\s*<\/figure>/g,
    (_m, inner) => `<figure class="cs-quote"><blockquote>${inner}</blockquote></figure>`
  );

  // Emoji spans arrive empty (the glyph lives in beehiiv's renderer), so
  // they would render as stray gaps.
  h = h.replace(/<span[^>]*data-type="emoji"[^>]*>\s*<\/span>/g, '');

  h = stripNoise(h);

  // Bare <span> left over once its only attribute was inline boldness.
  h = h.replace(/<span>([\s\S]*?)<\/span>/g, '$1');

  // beehiiv nests a paragraph inside every list item; the site's list
  // styles expect the text directly.
  h = h.replace(/<li>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/g, '<li>$1</li>');

  // Headings all become the site's section title, whatever level beehiiv
  // used. Levels were chosen for the email's visual rhythm, not for an
  // outline, and h2 is what /guides uses under the h1.
  h = h.replace(/<h[234]([^>]*)>([\s\S]*?)<\/h[234]>/g, (_m, _attrs, text) => {
    const clean = text.replace(/<\/?strong>/g, '').trim();
    return `<h2 class="cs-section-title">${clean}</h2>`;
  });

  h = h.replace(/<ul>/g, '<ul class="cs-bullets">');
  h = h.replace(/<ol>/g, '<ol class="cs-bullets">');

  // Empty paragraphs are spacers in the email. The stylesheet handles
  // rhythm here.
  h = h.replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/g, '');

  // beehiiv marks outbound links nofollow by default, including links to
  // Shane's own properties.
  h = h.replace(/\s+rel="noopener noreferrer nofollow"/g, ' rel="noopener noreferrer"');

  // Each issue opens by greeting the inbox it landed in. On an archive page
  // the reader has arrived by link or search, so the greeting addresses a
  // moment that is not happening.
  h = h.replace(/^\s*<p>(?:Hey|Hi|Hello)\b[^<]{0,40},\s*<\/p>/, '');

  // The sign-off ends with the certainly.coop URL spelled out, which is how
  // you close an email and not how you close a page that already carries
  // the site's footer.
  h = h.replace(
    /(?:<br\s*\/?>)?\s*<a [^>]*href="https:\/\/www\.certainly\.coop\/?"[^>]*>\s*www\.certainly\.coop\s*<\/a>/g,
    ''
  );

  return h.trim();
}

/**
 * A horizontal rule in the newsletter is a beat change. On the site that
 * reads as a new <section>, which is how /guides is structured, so the
 * body is split on <hr> rather than rendering a literal line.
 */
function toSections(bodyHtml) {
  return bodyHtml
    .split(/<hr[^>]*\/?>/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map(
      (chunk) =>
        `  <section class="om-section">\n    <div class="container">\n${indent(chunk)}\n    </div>\n  </section>`
    )
    .join('\n\n');
}

function indent(html) {
  // One block-level tag per line, indented to match the hand-written pages.
  return html
    .replace(/></g, '>\n<')
    .split('\n')
    .map((line) => '      ' + line.trim())
    .filter((line) => line.trim())
    .join('\n');
}

/* ------------------------------------------------------------------ *
 * Text helpers
 * ------------------------------------------------------------------ */

const stripTags = (s = '') => String(s).replace(/<[^>]*>/g, '');

// Smart quotes and dashes are fine in rendered copy but break JSON-LD and
// meta attributes in ways that are tedious to debug, so metadata gets the
// plain equivalents.
const plain = (s = '') =>
  stripTags(s)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/—/g, '--')
    .replace(/–/g, '-')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isoDate = (d) => new Date(d).toISOString().slice(0, 10);

const longDate = (d) =>
  new Date(d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

/**
 * beehiiv slugs are generated from the subject line and some carry a random
 * hash suffix (…-a50d1a7a308fabe2) or an apostrophe split into loose
 * letters (you-re-not-…). Neither belongs in a URL on this site, but the
 * beehiiv slug is still recorded in posts.json so the two can be matched up
 * on the next sync.
 */
function siteSlug(post) {
  if (post.site_slug) return post.site_slug;
  return post.slug
    .replace(/-[0-9a-f]{16}$/, '')
    .replace(/^you-re-/, 'youre-')
    .replace(/-isn-t-/, '-isnt-')
    .replace(/-didn-t-/, '-didnt-')
    .replace(/-don-t-/, '-dont-')
    .replace(/-that-s-/, '-thats-')
    .replace(/-what-s-/, '-whats-')
    .replace(/-we-re-/, '-were-')
    .replace(/-i-m-/, '-im-')
    .replace(/-and-that-s-okay$/, '');
}

/* ------------------------------------------------------------------ *
 * Shared chrome, lifted from the hand-written pages so the blog cannot
 * drift away from the rest of the site.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Framing notes
 *
 * The archive is written for certification leaders, which is not who most
 * of this site is written for. Rather than rewrite what was actually sent,
 * each certification-framed issue carries a note saying who it was for and
 * which part carries over. Notes live in their own file so a sync from
 * beehiiv cannot overwrite them.
 * ------------------------------------------------------------------ */

const notesFile = JSON.parse(readFileSync(NOTES, 'utf8'));
const NOTE_LABEL = notesFile._label;

function note(post) {
  const body = notesFile[post.id];
  if (!body) return '';
  return `
  <section class="om-section">
    <div class="container">
      <aside class="blog-note">
        <span class="blog-note-label">${esc(NOTE_LABEL)}</span>
        <p>${body}</p>
      </aside>
    </div>
  </section>
`;
}

/* ------------------------------------------------------------------ *
 * Page templates
 * ------------------------------------------------------------------ */

function postPage(post, prev, next) {
  const slug = siteSlug(post);
  const url = `${SITE}/blog/${slug}`;
  // The issue's own object, when it exists, doubles as the social preview.
  // A card image beats the site-wide og-social.png in a feed: it is specific
  // to the piece and it is what the reader already saw on the index.
  const artPath = `images/blog/${slug}.png`;
  const hasArt = existsSync(resolve(ROOT, artPath));
  const shareImage = hasArt ? `${SITE}/${artPath}` : `${SITE}/og-social.png`;
  const title = plain(post.title);
  const desc = plain(post.subtitle) || title;
  const published = isoDate(post.published_at);

  const nav = [];
  if (next) nav.push(`<a href="/blog/${siteSlug(next)}">&larr; ${esc(plain(next.title))}</a>`);
  if (prev) nav.push(`<a href="/blog/${siteSlug(prev)}">${esc(plain(prev.title))} &rarr;</a>`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
${GTM_HEAD}
${LINKEDIN_HEAD}

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | Shane Gring</title>
<meta name="description" content="${esc(desc)}">
<meta name="author" content="Shane Gring">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">

<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="alternate icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<meta name="theme-color" content="#ffffff">

<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="Shane Gring">
<meta property="og:image" content="${shareImage}">
<meta property="article:published_time" content="${published}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${shareImage}">

<link rel="alternate" type="application/rss+xml" title="Seeking Certainty" href="/blog/feed.xml">
<link rel="stylesheet" href="/styles.css">
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
{"@type":"NewsArticle","@id":"${url}#article","headline":${JSON.stringify(title)},"description":${JSON.stringify(desc)},"author":{"@id":"${SITE}/#person"},"publisher":{"@id":"${SITE}/#person"},"datePublished":"${published}","dateModified":"${published}","mainEntityOfPage":"${url}","image":"${shareImage}","isPartOf":{"@type":"Blog","@id":"${SITE}/blog/#blog","name":${JSON.stringify(PUB_NAME)}}},
{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"${SITE}/"},{"@type":"ListItem","position":2,"name":"Newsletter","item":"${SITE}/blog/"},{"@type":"ListItem","position":3,"name":${JSON.stringify(title)},"item":"${url}"}]}]}
</script>
</head>

<body>
${GTM_BODY}

<!--
  Generated by tools/build-blog.mjs from blog/_data/posts.json.
  Do not hand-edit: the next build overwrites this file.
  Source issue: ${post.beehiiv_url}
-->

${ANNOUNCE}

${NAV}

<main>
  <article>
  <section class="om-hero">
    <div class="container">
      <a href="/blog/" class="cs-back"><span class="btn-arrow">&larr;</span> All issues</a>

      <span class="section-eyebrow">${esc(PUB_NAME)} &middot; ${longDate(post.published_at)}</span>
      <h1 class="cs-hook">${esc(post.title)}</h1>
${post.subtitle ? `\n      <p class="om-lede">${esc(post.subtitle.trim())}</p>\n` : ''}${
  hasArt
    ? `\n      <img class="blog-hero-art" src="/${artPath}" alt="" width="168" height="168" loading="lazy">\n`
    : ''
}    </div>
  </section>
${note(post)}

${toSections(convert(post.content))}

  <section class="om-section om-investment">
    <div class="container">
      <h2 class="cs-section-title">Get the next one</h2>

      <p class="guide-cta-line">
        <strong>${esc(PUB_NAME)} goes out when there's something worth
        sending</strong> — what I'm working on, what broke, and how I
        fixed it.
      </p>

      ${subscribeForm(`issue:${slug}`, 'sub-email-issue')}

      <p>
        Want the same eye on your own site? Start with the
        <a href="/scan">free Scan</a>.
      </p>
    </div>
  </section>
${
  nav.length
    ? `
  <section class="om-section">
    <div class="container">
      <p class="cs-back">${nav.join(' &nbsp;&middot;&nbsp; ')}</p>
    </div>
  </section>
`
    : ''
}  </article>
</main>

${footerHtml()}
`;
}

function indexPage(posts) {
  // Cards, not the row list /guides uses. Art is optional: an issue with no
  // image at images/blog/<slug>.png renders as a text-only card rather than
  // a broken one, so a new issue is never blocked on having a picture.
  const items = posts
    .map((p) => {
      const slug = siteSlug(p);
      const art = `images/blog/${slug}.png`;
      const hasArt = existsSync(resolve(ROOT, art));
      const thumb = hasArt
        ? `\n            <img class="blog-card-thumb" src="/${art}" alt="" width="92" height="92" loading="lazy">`
        : '';
      return `        <li class="blog-card${hasArt ? '' : ' blog-card-noart'}">
          <a href="/blog/${slug}">${thumb}
            <span class="blog-card-text">
              <span class="blog-card-date">${longDate(p.published_at)}</span>
              <span class="blog-card-title">${esc(p.title)}</span>
              ${p.subtitle ? `<span class="blog-card-sub">${esc(p.subtitle.trim())}</span>` : ''}
            </span>
          </a>
        </li>`;
    })
    .join('\n');

  const graph = posts
    .map(
      (p) =>
        `{"@type":"NewsArticle","headline":${JSON.stringify(plain(p.title))},"url":"${SITE}/blog/${siteSlug(p)}","datePublished":"${isoDate(p.published_at)}"}`
    )
    .join(',\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
${GTM_HEAD}
${LINKEDIN_HEAD}

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(PUB_NAME)}: the newsletter archive | Shane Gring</title>
<meta name="description" content="Every issue of Seeking Certainty: what Shane Gring is working on, what broke, and how he fixed it. Certification work, and the digital systems around it.">
<meta name="author" content="Shane Gring">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${SITE}/blog/">

<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="alternate icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<meta name="theme-color" content="#ffffff">

<meta property="og:type" content="website">
<meta property="og:title" content="${esc(PUB_NAME)}: the newsletter archive">
<meta property="og:description" content="Every issue of Seeking Certainty — what I'm working on, what broke, and how I fixed it.">
<meta property="og:url" content="${SITE}/blog/">
<meta property="og:site_name" content="Shane Gring">
<meta property="og:image" content="${SITE}/og-social.png">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(PUB_NAME)} | Shane Gring">
<meta name="twitter:description" content="Every issue of Seeking Certainty — what I'm working on, what broke, and how I fixed it.">
<meta name="twitter:image" content="${SITE}/og-social.png">

<link rel="alternate" type="application/rss+xml" title="Seeking Certainty" href="/blog/feed.xml">
<link rel="stylesheet" href="/styles.css">
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
{"@type":"Blog","@id":"${SITE}/blog/#blog","name":${JSON.stringify(PUB_NAME)},"description":"What I'm working on, what broke, and how I fixed it. Certification work, and the digital systems around it.","url":"${SITE}/blog/","author":{"@id":"${SITE}/#person"},"publisher":{"@id":"${SITE}/#person"},"blogPost":[
${graph}]},
{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"${SITE}/"},{"@type":"ListItem","position":2,"name":"Newsletter","item":"${SITE}/blog/"}]}]}
</script>
</head>

<body>
${GTM_BODY}

<!--
  Generated by tools/build-blog.mjs from blog/_data/posts.json.
  Do not hand-edit: the next build overwrites this file.
-->

${ANNOUNCE}

${NAV}

<main>
  <section class="om-hero">
    <div class="container">
      <span class="section-eyebrow">Newsletter &middot; ${posts.length} issues</span>
      <h1 class="cs-hook">${esc(PUB_NAME)}</h1>

      <p class="om-lede">
        What I pick up running a few companies and helping run a few more —
        <strong>what I'm working on, what broke, and how I fixed it</strong>.
        Certification work is still most of what I do, so it keeps showing
        up here; there's just more around it now. Sent when there's
        something worth sending. Every issue is archived below, in full.
      </p>

      ${subscribeForm('blog-index', 'sub-email-index')}
    </div>
  </section>

  <section class="om-section">
    <div class="container">
      <ul class="blog-cards">
${items}
      </ul>
    </div>
  </section>

  <section class="om-section om-investment">
    <div class="container">
      <h2 class="cs-section-title">Looking for the how-to instead?</h2>

      <p class="guide-cta-line">
        The newsletter is what I'm thinking about. <strong>The guides are
        the step-by-step</strong> — AI readability, content layers, service
        pages, schema, crawlers.
      </p>

      <a class="btn-primary" href="/guides/">
        Read the guides <span class="btn-arrow">&rarr;</span>
      </a>
    </div>
  </section>
</main>

${footerHtml()}
`;
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

const posts = JSON.parse(readFileSync(DATA, 'utf8'))
  .filter((p) => p.status === 'published')
  .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

mkdirSync(OUT, { recursive: true });

posts.forEach((post, i) => {
  // Newest first, so the "previous" issue is the next one down the list.
  const prev = posts[i + 1] || null;
  const next = posts[i - 1] || null;
  const file = resolve(OUT, `${siteSlug(post)}.html`);
  writeFileSync(file, postPage(post, prev, next));
  console.log(`  /blog/${siteSlug(post)}`);
});

writeFileSync(resolve(OUT, 'index.html'), indexPage(posts));
console.log(`  /blog/`);

// Refresh the homepage "From the newsletter" strip between its markers, the
// same way build-notes.mjs refreshes the notes rail. Keeps the three most
// recent issues on the front door without hand-editing index.html.
refreshHomeNewsletter(posts);

function postExcerpt(p) {
  if (p.subtitle && p.subtitle.trim()) return p.subtitle.trim();
  // Strip beehiiv's inline <style>/<script> blocks before flattening to text,
  // or the excerpt starts with their table CSS instead of the actual copy.
  const raw = String(p.content || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');
  const text = plain(raw);
  if (!text || /[{}]/.test(text.slice(0, 40))) return '';
  if (text.length <= 140) return text;
  return text.slice(0, 140).replace(/\s+\S*$/, '') + '…';
}

function refreshHomeNewsletter(allPosts) {
  const HOME = resolve(ROOT, 'index.html');
  const START = '<!-- newsletter:start -->';
  const END = '<!-- newsletter:end -->';
  if (!existsSync(HOME)) return;
  const home = readFileSync(HOME, 'utf8');
  if (!home.includes(START) || !home.includes(END)) {
    console.log('  index.html: no newsletter markers found, homepage left alone');
    return;
  }
  const cards = allPosts
    .slice(0, 3)
    .map((p) => {
      const desc = postExcerpt(p);
      return `      <li>
        <a class="home-post" href="/blog/${siteSlug(p)}">
          <span class="home-post-when"><time datetime="${isoDate(p.published_at)}">${longDate(p.published_at)}</time></span>
          <span class="home-post-title">${esc(plain(p.title))}</span>${
            desc ? `\n          <span class="home-post-desc">${esc(desc)}</span>` : ''
          }
        </a>
      </li>`;
    })
    .join('\n');
  const block = `${START}\n    <ul class="home-post-grid">\n${cards}\n    </ul>\n    ${END}`;
  const next = home.replace(new RegExp(`${START}[\\s\\S]*?${END}`), () => block);
  writeFileSync(HOME, next);
  console.log('  index.html: newsletter strip refreshed');
}

// Writing pages does not remove them. A post that gets unpublished, or one
// that was built before a slug changed -- or a scheduled issue that a
// previous run should not have written at all -- would otherwise stay on
// disk and go on being deployed and indexed.
const expected = new Set(posts.map((p) => `${siteSlug(p)}.html`).concat('index.html'));
for (const file of readdirSync(OUT)) {
  if (!file.endsWith('.html') || expected.has(file)) continue;
  unlinkSync(resolve(OUT, file));
  console.log(`  removed /blog/${file.replace(/\.html$/, '')} (no longer published)`);
}

console.log(`\n${posts.length} issues built.`);

const urls = posts.map((p) => ({
  loc: `${SITE}/blog/${siteSlug(p)}`,
  lastmod: isoDate(p.published_at),
}));
writeFileSync(resolve(OUT, '_data/urls.json'), JSON.stringify(urls, null, 2));

/* ------------------------------------------------------------------ *
 * Feed
 *
 * An archive with no feed is a dead end for anyone who would rather not
 * hand over an email address to follow along. beehiiv's own feed sits
 * behind a Cloudflare bot challenge, so this is the only machine-readable
 * copy of the newsletter that a reader or an aggregator can actually get.
 * ------------------------------------------------------------------ */

{
  const rfc822 = (d) => new Date(d).toUTCString();
  const items = posts
    .map((p) => {
      const url = `${SITE}/blog/${siteSlug(p)}`;
      return `    <item>
      <title>${esc(plain(p.title))}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${rfc822(p.published_at)}</pubDate>
      <description>${esc(plain(p.subtitle) || plain(p.title))}</description>
      <content:encoded><![CDATA[${convert(p.content)}]]></content:encoded>
    </item>`;
    })
    .join('\n');

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(PUB_NAME)}</title>
    <link>${SITE}/blog/</link>
    <atom:link href="${SITE}/blog/feed.xml" rel="self" type="application/rss+xml" />
    <description>What I'm working on, what broke, and how I fixed it.</description>
    <language>en</language>
    <lastBuildDate>${rfc822(posts[0].published_at)}</lastBuildDate>
${items}
  </channel>
</rss>
`;
  writeFileSync(resolve(OUT, 'feed.xml'), feed);
  console.log('  /blog/feed.xml');
}

/* ------------------------------------------------------------------ *
 * Site-wide indexes
 *
 * sitemap.xml, sitemap.html and llms.txt each carry a list of the issues.
 * Rewriting them here rather than by hand means an unpublished post cannot
 * linger in one of them after its page has been pruned -- which is exactly
 * what happened the first time a scheduled issue got built by mistake.
 * Each rewrite replaces only its own block and leaves the rest alone.
 * ------------------------------------------------------------------ */

const ent = (s = '') =>
  esc(s)
    .replace(/’/g, '&rsquo;')
    .replace(/‘/g, '&lsquo;')
    .replace(/“/g, '&ldquo;')
    .replace(/”/g, '&rdquo;')
    .replace(/—/g, '&mdash;')
    .replace(/–/g, '&ndash;');

const BLURB =
  "Seeking Certainty. What I'm working on, what broke, and how I fixed it.";

function rewrite(file, pattern, replacement, label) {
  const path = resolve(ROOT, file);
  const before = readFileSync(path, 'utf8');
  const [after, count] = (() => {
    let n = 0;
    const out = before.replace(pattern, () => {
      n += 1;
      return replacement;
    });
    return [out, n];
  })();
  if (count !== 1) {
    console.warn(`  ! ${file}: expected 1 ${label} block, found ${count} — left unchanged`);
    return;
  }
  writeFileSync(path, after);
  console.log(`  ${file} updated`);
}

// sitemap.xml
{
  const newest = urls.reduce((a, u) => (u.lastmod > a ? u.lastmod : a), urls[0].lastmod);
  const block =
    [
      '  <url>',
      `    <loc>${SITE}/blog/</loc>`,
      `    <lastmod>${newest}</lastmod>`,
      '    <changefreq>weekly</changefreq>',
      '    <priority>0.8</priority>',
      '  </url>',
    ]
      .concat(
        urls.flatMap((u) => [
          '  <url>',
          `    <loc>${u.loc}</loc>`,
          `    <lastmod>${u.lastmod}</lastmod>`,
          '    <changefreq>monthly</changefreq>',
          '    <priority>0.7</priority>',
          '  </url>',
        ])
      )
      .join('\n') + '\n';

  const path = resolve(ROOT, 'sitemap.xml');
  let xml = readFileSync(path, 'utf8');
  xml = xml.replace(
    new RegExp(`  <url>\\s*<loc>${SITE}/blog/[^<]*</loc>[\\s\\S]*?</url>\\n`, 'g'),
    ''
  );
  xml = xml.replace('</urlset>', block + '</urlset>');
  writeFileSync(path, xml);
  console.log(`  sitemap.xml updated (${urls.length + 1} /blog/ urls)`);
}

// sitemap.html
rewrite(
  'sitemap.html',
  /  <section class="om-section">\s*<div class="container">\s*<h2 class="cs-section-title">Newsletter<\/h2>[\s\S]*?<\/section>\n\n/,
  '  <section class="om-section">\n    <div class="container">\n' +
    '      <h2 class="cs-section-title">Newsletter</h2>\n' +
    `      <p class="sitemap-blurb">${ent(BLURB)}</p>\n\n` +
    '      <ul class="sitemap-list">\n' +
    [
      '          <li>\n            <a href="/blog/">All issues</a>\n            <span class="sitemap-desc">The full archive</span>\n          </li>',
    ]
      .concat(
        posts.map(
          (p) =>
            `          <li>\n            <a href="/blog/${siteSlug(p)}">${ent(p.title)}</a>\n` +
            `            <span class="sitemap-desc">${ent(p.subtitle.trim())}</span>\n          </li>`
        )
      )
      .join('\n') +
    '\n      </ul>\n    </div>\n  </section>\n\n',
  'Newsletter'
);

// llms.txt
rewrite(
  'llms.txt',
  /## Newsletter\n[\s\S]*?(?=## Free tools)/,
  [
    '## Newsletter',
    '',
    `Seeking Certainty: what Shane is working on, what broke, and how he fixed it. Certification work is still most of it, with more around it now. Sent when there is something worth sending. Full archive: ${SITE}/blog/`,
    '',
  ]
    .concat(
      posts.map(
        (p) =>
          `- [${plain(p.title)}](${SITE}/blog/${siteSlug(p)}) — ${plain(p.subtitle).replace(/\.$/, '').toLowerCase()}.`
      )
    )
    .concat(['', ''])
    .join('\n'),
  'Newsletter'
);
