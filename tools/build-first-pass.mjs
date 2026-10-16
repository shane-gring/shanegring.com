#!/usr/bin/env node
/**
 * Builds the free first pass landing pages: /handled/first-pass and one page
 * per LinkedIn ad under /handled/first-pass/<slug>.
 *
 *   node tools/build-first-pass.mjs
 *
 * One ad, one page, so the click lands on the ad's own headline. Everything
 * below the hero (the steps, the form, who builds it, the work, the price,
 * the FAQ) is the same on every page, so it lives here once rather than in
 * seven hand-kept copies. Edit the PAGES data or the SHARED markup below,
 * run this, then `node tools/version-assets.mjs` (this emits asset URLs
 * unstamped, like the blog builder) and `node tools/build-markdown.mjs`, and
 * commit the output. Never hand-edit the generated HTML; the next run
 * replaces it.
 *
 * Campaign: "Handled · Campaign 2 · Free first pass" (2026-10). Each ad's
 * utm_content is its slug. The ads speak as "we"; the pages stay in Shane's
 * "I", like every other Handled page, because one person is the offer.
 *
 * KEEP IN STEP WITH /handled: $300 build, $200 a month, changes within one
 * working day, month to month. The 24 hour first pass is this
 * campaign's promise, also in the intake confirmation and the Apps Script
 * emails.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://shanegring.com';

// ── The pages ───────────────────────────────────────────────────────────────
// hook: the ad's on-image line, in Shane's voice; [[word]] gets the ad's red
// underline. It opens the hero as a small kicker, so the click lands on the
// words it came from without a second big headline beside the ad image.
// headline: the h1, the offer that answers the hook. lede: builds on the
// ad's intro text rather than repeating it. Say "no upfront cost" or "no
// strings attached", never that the site is built free. angle: one short section
// that carries the ad's idea a step further than the ad had room for.

const PAGES = [
  {
    slug: '',
    title: 'See your new website before you pay',
    description: 'Tell me about your business and I’ll build your new homepage first, with no upfront cost. You see it within 24 hours. If you like it, it goes live: $300 to build, $200 a month. If not, you owe nothing.',
    image: 'see-it-first',
    imageAlt: 'A preview of a new homepage for a heating and cooling company',
    hook: 'See your new website [[before]] you pay.',
    headline: 'I’ll build your new homepage first. You only pay if you like it.',
    lede: [
      'About 15 minutes from you: a few questions, your logo and a few photos. Within 24 hours, a link to your new site. No strings attached.',
    ],
  },
  {
    slug: 'business-changed',
    title: 'Your business changed. Did your website?',
    description: 'Updating your website shouldn’t be a hassle. I’ll rebuild it around your business as it is today and make staying up to date as simple as sending an email.',
    image: 'business-changed',
    imageAlt: 'An old roofing company homepage beside a fresh rebuild of it',
    hook: 'Your business changed. Did your [[website]]?',
    headline: 'I’ll rebuild your site and make staying up to date simple.',
    lede: [
      'New prices, new hours, someone new on the team. Keeping your website current shouldn’t be a project. I’ll rebuild your homepage and send you a link within 24 hours, no strings attached. If you keep it, every update after that is one email.',
    ],
    angle: {
      title: 'None of it is hard. It just isn’t anybody’s job.',
      body: [
        'So the old prices stay up, the hours stay wrong, and the person who left in March is still on the team page. Each change you’ve made to the business is one more thing the site gets wrong.',
        'The first pass starts from your business as it is today, not as it was when the site went up. And if you keep it, keeping it current is my job from then on: you email the change, it gets made.',
      ],
    },
  },
  {
    slug: 'see-it-first',
    title: 'See it before you pay',
    description: 'I build you a homepage, no strings attached. If you like it, I get it online and in front of your customers. About 15 minutes from you; a link within 24 hours.',
    image: 'see-it-first',
    imageAlt: 'A preview of a new homepage for a heating and cooling company, marked Preview',
    hook: 'See it [[before]] you pay.',
    headline: 'I build you a homepage, no strings attached.',
    lede: [
      'Answer a few questions about your business, then send your logo and a few photos. That’s about 15 minutes from you. Within 24 hours, you get a link to your new homepage.',
      'If you like it, I get it online and in front of the customers you’re trying to reach. If you don’t, you owe nothing.',
    ],
    angle: {
      title: 'Why I build it first',
      body: [
        'Buying a website usually means paying up front for something you’ve only seen in someone else’s portfolio. I’d rather you judge the real thing: your business, your words, your photos, on a page you can click through on your own phone.',
        'If it isn’t right, you’ve spent fifteen minutes. If it is, you already know exactly what you’re buying.',
      ],
    },
  },
  {
    slug: 'handled',
    title: 'Your website, handled',
    description: 'See your rebuilt site with no commitment. If you keep it, you also get one person whose job is to watch it, change it and improve it for as long as you want.',
    image: 'handled',
    imageAlt: 'A dental practice homepage with an email asking for Saturday hours and a reply saying it is live',
    hook: 'Your website, [[handled]].',
    headline: 'A new site, and someone whose job it is to look after it.',
    lede: [
      'Most small-business websites go stale because looking after them is nobody’s job. Start by seeing your rebuilt homepage, with no commitment. If you keep it, I check it every week, make the changes you email, and keep improving it for as long as you want me to.',
    ],
    angle: {
      title: 'Here’s what a change looks like',
      thread: {
        ask: ['From: you', 'Subject: Saturday hours', 'We’re opening Saturdays, 8 to 1. Can we add that?'],
        reply: ['From: Shane', 'Re: Saturday hours', 'Done. It’s live on the homepage and the contact page.'],
      },
      body: [
        'No dashboard, no ticket, no login. An email to a person, done within one working day and usually the same day. That’s the $200 a month, once you’re in.',
      ],
    },
  },
  {
    slug: 'salesperson',
    title: 'Make your website a 24-hour salesperson',
    description: 'Your website is part of your sales team, and the one member who never sleeps. I’ll rebuild it to help bring in business, not just look nice. See it within 24 hours; pay only if you like it.',
    image: 'salesperson',
    imageAlt: 'A plumbing company homepage on a phone at 10 at night, with a new quote request arriving',
    hook: 'Make your website a [[24-hour]] salesperson.',
    headline: 'I’ll rebuild your site to help bring in business, not just look nice.',
    lede: [
      'Your website is the one member of your sales team who never sleeps. At 10pm, someone finds you with a leak, a deadline or a question about your prices. Your site is the only thing there to answer them.',
      'See what I’d build within 24 hours, and only pay if you like it.',
    ],
    angle: {
      title: 'You were asleep. Make sure your website isn’t.',
      body: [
        'So it needs to do what a good salesperson would, at any hour:',
      ],
      list: [
        ['What you do, said plainly.', 'In the first screen, in the words your customers use.'],
        ['Who it’s for and where.', 'So the right people know they’re in the right place.'],
        ['One clear next step.', 'Call, book or ask for a quote, without hunting for it on a phone.'],
      ],
    },
  },
  {
    slug: 'fifteen-minutes',
    title: 'Give me 15 minutes. Get a new website.',
    description: 'Give me 15 minutes on your business and within 24 hours you’ll see a new look at your website. You only pay if you like it.',
    image: 'fifteen-minutes',
    imageAlt: 'A short business intake form beside the landscaping homepage built from it',
    hook: 'Give me [[15 minutes]]. Get a new website.',
    headline: 'Within 24 hours, you’ll see a new look at your site.',
    lede: [
      'Take 15 minutes to tell me about your business: a few questions about what you do and who you serve, plus your logo and a few photos. Talk it through or type it.',
      'No upfront cost, and you only pay if you like what comes back.',
    ],
    angle: {
      title: 'What the 15 minutes covers',
      list: [
        ['The basics.', 'Your business name, what you do in a line, where you work.'],
        ['Five minutes on your business.', 'Talk it through out loud, or type it if you’d rather. Who you serve, what you’re known for, what people ask you.'],
        ['Your logo and a few photos.', 'Of your work, your space or your team. Whatever you have.'],
      ],
      body: ['It saves as you go, so you can start at your desk and finish on your phone.'],
    },
  },
  {
    slug: 'ai-answer',
    title: 'When AI recommends someone, is it you?',
    description: 'More buyers now start with an AI assistant. I’ll rebuild your site so AI and search can tell what you do and who you serve. No strings attached, no upfront cost; you pay only if you like it.',
    image: 'ai-answer',
    imageAlt: 'An AI assistant answering “Who’s the best bookkeeper near me?” with your business listed first',
    hook: 'When AI recommends someone, is it [[you]]?',
    headline: 'I’ll rebuild your site so AI assistants can tell what you do and who you serve.',
    lede: [
      'More buyers now start with an AI assistant instead of a page of links. If your site isn’t built for that, you’re not in the answer. No strings attached and no upfront cost: you see the rebuild first, and only pay if you like it.',
    ],
    angle: {
      title: 'What “built for AI” means here',
      list: [
        ['Your words are in the page.', 'Not hidden behind code an assistant never runs, so there’s something there for it to read.'],
        ['Plain answers to plain questions.', 'What you do, where, for whom and what it costs, written so an assistant can quote it.'],
        ['The details marked up.', 'Your services, location and hours labelled so search engines and AI read them correctly.'],
      ],
      body: ['Nobody can promise an AI will pick you. What I can do is make sure it can read you.'],
    },
  },
];

// ── Shared markup ───────────────────────────────────────────────────────────

const STEPS = [
  ['01', 'Tell me about your business', 'About 15 minutes: a few questions, your logo and a few photos. Type it, or just talk.'],
  ['02', 'See your new homepage', 'Within 24 hours you get a link to it. Click around, show it to someone, and send me what you’d change.'],
  ['03', 'Decide', 'Love it, and it goes live: $300 to build, once, then $200 a month. Don’t, and you owe nothing.'],
];

const GETS = [
  ['An email that reaches a person.', 'New price, new hire, hours changed, a line rewritten. Send it and it’s done within one working day.'],
  ['Checked every week, reported every month.', 'Anything slow or broken gets fixed before your customers find it.'],
  ['A little more every month.', 'The site grows a piece at a time inside the $200, not just stays put.'],
  ['Everything in your name.', 'Your domain and your accounts. Month to month, cancel any time.'],
];

const FAQ = [
  ['Is there really no upfront cost?', 'None. No card, no deposit, nothing to cancel. You fill in the intake, I build your homepage, you look at it. If you don’t want it, that’s the end of it and you owe nothing.'],
  ['What do I need to have ready?', 'Your logo and a few photos if you have them. Everything else is questions about your business you already know the answers to. It saves as you go, so you don’t need to finish in one sitting.'],
  ['I already have a website. Does that matter?', 'Not at all. Put it in the form and I’ll carry over the words and images worth keeping. Your domain stays yours; if you go ahead, I point it at the new site.'],
  ['What happens if I like it?', 'You get one round of changes, then it goes live for $300, once, and $200 a month from then on. That monthly part is me: changes by email within one working day, weekly checks, a monthly report, and the site growing a piece at a time.'],
  ['Who actually builds it?', 'I do. Shane Gring, fifteen years running websites and digital operations. No agency, no hand-off to someone you’ve never met.'],
];

const SHOTS = [
  ['https://tedgonder.co', '/images/handled/tedgonder.webp', 1200, 750, 'Ted Gonder', 'Private strategic advisory · tedgonder.co'],
  ['https://drvngolf.com', '/images/handled/7-drvn.png', 1280, 713, 'DRVN', 'The golf performance system · drvngolf.com'],
  ['https://greenstarhomes.org', '/images/handled/greenstar.webp', 1200, 750, 'GreenStar Homes', 'Green home certification · greenstarhomes.org'],
];

// ── Rendering ───────────────────────────────────────────────────────────────

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hook = (s) => esc(s).replace(/\[\[(.+?)\]\]/g, '<span class="hc-strike">$1</span>');
const plain = (s) => s.replace(/\[\[|\]\]/g, '');

function angle(a) {
  if (!a) return '';
  const thread = a.thread
    ? `
      <div class="hc-thread" aria-label="An example email exchange">
        <div class="hc-mail">
          <div class="hc-mail-meta"><span>${esc(a.thread.ask[0])}</span><span>${esc(a.thread.ask[1])}</span></div>
          <p>${esc(a.thread.ask[2])}</p>
        </div>
        <div class="hc-reply-slot">
          <div class="hc-mail hc-mail-reply">
            <div class="hc-mail-meta"><span>${esc(a.thread.reply[0])}</span><span>${esc(a.thread.reply[1])}</span></div>
            <p>${esc(a.thread.reply[2])}</p>
          </div>
        </div>
      </div>`
    : '';
  const list = a.list
    ? `
      <ul class="hd-gets fp-list">
${a.list.map(([b, t]) => `        <li><strong>${esc(b)}</strong> ${esc(t)}</li>`).join('\n')}
      </ul>`
    : '';
  const body = (a.body || []).map((p) => `      <p class="fp-angle-p">${esc(p)}</p>`).join('\n');
  // A thread or list leads; the paragraphs follow. A plain section is just
  // paragraphs.
  return `
  <section class="hd-section fp-angle">
    <div class="container">
      <h2 class="hd-title">${esc(a.title)}</h2>${thread}${list}
${body}
    </div>
  </section>
`;
}

function page(p) {
  const path = p.slug ? `/handled/first-pass/${p.slug}` : '/handled/first-pass';
  const url = SITE + path;
  const img = `/images/handled/first-pass/${p.image}.webp`;
  const cta = (where, label = 'See my new site first') =>
    `<a class="btn-primary" data-hd-cta="${where}" href="#start">${label} <span class="btn-arrow">&darr;</span></a>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<!-- GENERATED by tools/build-first-pass.mjs. Do not edit by hand. -->
<!-- Google Tag Manager: production host only, so local and preview work stays out of GA4 -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];
var h=w.location.hostname;if(h!=='shanegring.com'&&h!=='www.shanegring.com'&&w.location.search.indexOf('gtm_debug')<0)return;
w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-WHSTF58T');</script>
<!-- End Google Tag Manager -->
<!-- LinkedIn Insight Tag: same production-host gate as GTM above. Append
?li_debug to a URL to fire it anyway. -->
<script>(function(){
var h=window.location.hostname;if(h!=='shanegring.com'&&h!=='www.shanegring.com'&&window.location.search.indexOf('li_debug')<0)return;
window._linkedin_partner_id='9807674';
window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];
window._linkedin_data_partner_ids.push(window._linkedin_partner_id);
if(!window.lintrk){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}
var s=document.getElementsByTagName('script')[0],b=document.createElement('script');
b.type='text/javascript';b.async=true;b.src='https://snap.licdn.com/li.lms-analytics/insight.min.js';
s.parentNode.insertBefore(b,s);
})();</script>
<!-- End LinkedIn Insight Tag -->

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(p.title)} | Handled</title>
<meta name="description" content="${esc(p.description)}">
<meta name="author" content="Shane Gring">

<!-- Paid-traffic landing page: noindex, follow, out of sitemap.xml and
     llms.txt, no robots.txt Disallow (LinkedIn has to be able to read it).
     Same arrangement as /handled/fixes and /get-the-read. -->
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${url}">

<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="alternate icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<meta name="theme-color" content="#ffffff">

<meta property="og:type" content="website">
<meta property="og:title" content="${esc(plain(p.hook))}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="Shane Gring">
<meta property="og:image" content="${SITE}${img}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(plain(p.hook))}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:image" content="${SITE}${img}">

<link rel="stylesheet" href="/styles.css">
</head>

<body class="offer-handled hc-page fp-page">
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-WHSTF58T"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->

<header class="vsl-header">
  <div class="container">
    <a class="logo" href="/" aria-label="Shane Gring, home"><img class="logo-cloud" src="/images/cloud-1.svg" alt="Shane Gring" width="224" height="80"><img class="logo-bolt" src="/images/cloud-bolt.svg" alt="" width="32" height="48" aria-hidden="true"></a>
    <span class="vsl-header-note">Handled &middot; no strings attached</span>
  </div>
</header>

<main>
  <section class="hc-hero fp-hero">
    <div class="container">
      <div class="hc-hero-copy">
        <p class="fp-kicker">${hook(p.hook)}</p>
        <h1 class="hc-hook fp-headline">${esc(p.headline)}</h1>
${p.lede.map((l) => `        <p class="hd-lede hc-lede">${esc(l)}</p>`).join('\n')}
        <div class="hd-cta hc-cta">
          ${cta('hero')}
          <ul class="hd-assure">
            <li>No card</li>
            <li>About 15 minutes</li>
            <li>Yours in 24 hours</li>
          </ul>
        </div>
      </div>
      <figure class="fp-ad">
        <img src="${img}" alt="${esc(p.imageAlt)}" width="720" height="720" fetchpriority="high">
      </figure>
    </div>
  </section>
${angle(p.angle)}
  <section class="hd-section">
    <div class="container">
      <h2 class="hd-title">How it works</h2>
      <ol class="hc-steps">
${STEPS.map(([n, h, t]) => `        <li><span class="hc-step-num">${n}</span><h3>${esc(h)}</h3><p>${esc(t)}</p></li>`).join('\n')}
      </ol>
    </div>
  </section>

  <section class="hd-section fp-start" id="start">
    <div class="container">
      <h2 class="hd-title">Tell me about your business</h2>
      <p class="hd-sub">Four quick details, then straight into the intake. I’ll email you a link back to it too.</p>

      <form class="sr-form fp-form" data-first-pass novalidate aria-label="Tell me about your business">
        <label class="sr-field">
          <span class="contact-flabel">Your name</span>
          <input type="text" name="name" autocomplete="name" required maxlength="200">
        </label>
        <label class="sr-field">
          <span class="contact-flabel">Email</span>
          <input type="email" name="email" autocomplete="email" placeholder="you@yourcompany.com" required maxlength="200">
        </label>
        <label class="sr-field">
          <span class="contact-flabel">Business name</span>
          <input type="text" name="business" autocomplete="organization" required maxlength="200">
        </label>
        <label class="sr-field">
          <span class="contact-flabel">Current website <em>(if you have one)</em></span>
          <input type="text" name="website" inputmode="url" autocomplete="url" spellcheck="false" placeholder="yourcompany.com" maxlength="200">
        </label>
        <input class="sub-form-trap" type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true"
               style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
        <button type="submit" class="sr-submit">Start my intake <span class="btn-arrow">&rarr;</span></button>
        <p class="sr-note">No card. Nothing to pay unless you love it and want it live.</p>
        <p class="fp-status" data-first-pass-status role="status" aria-live="polite" hidden></p>
      </form>
      <noscript><p class="fp-noscript">This form needs JavaScript. Email <a href="mailto:shane@shanegring.com">shane@shanegring.com</a> and I’ll send your intake link.</p></noscript>
    </div>
  </section>

  <section class="hd-section">
    <div class="container">
      <div class="hc-person">
        <figure class="hc-print">
          <img src="/images/handled/shane-family.webp" alt="Shane Gring at home on the couch with his family" width="1000" height="800" loading="lazy">
          <figcaption>me and my girls</figcaption>
        </figure>
        <div class="hc-person-text">
          <p class="hc-person-lead">You’re dealing with a person, not an agency.</p>
          <p>I’m Shane Gring. Fifteen years running websites, analytics and
          digital operations for founders and companies. I build your first
          pass myself, and if you keep it, every change you email comes to me.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="hd-section" id="examples">
    <div class="container">
      <h2 class="hd-title">Sites built and handled the same way</h2>
      <p class="hd-sub">Real sites, live right now.</p>
      <div class="hd-shots fp-shots">
${SHOTS.map(([href, src, w, h, name, what]) => `        <a class="hd-shot" href="${href}" target="_blank" rel="noopener">
          <img src="${src}" alt="Homepage of ${esc(href.replace('https://', ''))}" width="${w}" height="${h}" loading="lazy">
          <span class="hd-shot-meta"><span class="hd-shot-name">${esc(name)}</span><span class="hd-shot-what">${esc(what).replace(' · ', ' &middot; ')}</span></span>
        </a>`).join('\n')}
      </div>
    </div>
  </section>

  <section class="hd-section">
    <div class="container">
      <h2 class="hd-title">If you love it</h2>
      <p class="hd-sub">It goes live for <strong>$300 to build, once</strong>, then <strong>$200 a month</strong> for the person whose job it is to keep it right.</p>
      <ul class="hd-gets">
${GETS.map(([b, t]) => `        <li><strong>${esc(b)}</strong> ${esc(t)}</li>`).join('\n')}
      </ul>
    </div>
  </section>

  <section class="hd-section">
    <div class="container">
      <h2 class="hd-title">A few honest answers</h2>
      <div class="hd-qa">
${FAQ.map(([q, a]) => `        <details>
          <summary>${esc(q)}</summary>
          <p>${esc(a)}</p>
        </details>`).join('\n')}
      </div>
    </div>
  </section>

  <section class="hd-final fp-final">
    <div class="container">
      <h2 class="hd-title">See it before you pay.</h2>
      <p class="hd-sub">About 15 minutes from you. A link to your new homepage within 24 hours.</p>
      <div class="hd-cta">
        ${cta('final')}
      </div>
    </div>
  </section>
</main>

<footer>
  <img class="footer-city" src="/images/footer-city.png" alt="" width="2176" height="544" loading="lazy" aria-hidden="true">
  <div class="container">
    <p class="footer-tag">Operations that run beyond you.</p>
    <div class="footer-content">
      <span>&copy; 2026 SOEN, LLC, dba Shane Gring</span>
      <span><a href="/about" class="footer-link">About Shane Gring</a></span>
      <span><a href="/contact" class="footer-link">Contact</a></span>
      <span><a href="/privacy" class="footer-link">Privacy</a></span>
      <span><a href="/terms" class="footer-link">Terms</a></span>
      <span><a href="/cookies" class="footer-link">Cookies</a></span>
    </div>
  </div>
</footer>

<script src="/track.js" defer></script>
<script src="/assets/handled/first-pass.js" defer></script>
</body>
</html>
`;
}

for (const p of PAGES) {
  const rel = p.slug ? `handled/first-pass/${p.slug}.html` : 'handled/first-pass.html';
  const out = resolve(ROOT, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, page(p));
  console.log(`  ${rel}`);
}
console.log(`\nWrote ${PAGES.length} first pass page(s).`);
