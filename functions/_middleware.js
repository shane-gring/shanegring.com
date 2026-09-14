// Edge middleware for shanegring.com (Cloudflare Pages Functions).
//
// It runs before static-asset serving on every request and does two jobs that
// the plain static host cannot:
//
//   1. Real 404s. The Pages project serves an SPA-style fallback, so unknown
//      paths return index.html with HTTP 200 — a "soft 404" that makes agents
//      probing for resources believe every path exists. Here, any path that is
//      not a real page, asset, or _redirects source returns a genuine 404. A
//      browser gets the styled 404.html; agents get a short Markdown body
//      pointing at the sitemap, llms.txt, and key indexes.
//
//   2. Markdown content negotiation (acceptmarkdown.com). A client sending
//      `Accept: text/markdown` for a page gets the page's pre-built .md sibling
//      with `Content-Type: text/markdown; charset=utf-8` and
//      `Vary: Accept, Accept-Encoding`. HTML responses for pages also carry
//      `Vary: Accept` so a CDN keys its cache on the negotiated variant.
//
// The routing decision lives in ./_negotiation.js (pure, unit-tested). This file
// only maps a decision to a Cloudflare Response. The route manifest
// (functions/routes.json) and the .md siblings are generated before deploy by
// tools/build-routes.mjs and tools/build-markdown.mjs.
//
// The whole handler is wrapped so any unexpected error falls through to normal
// serving — a bug here must never take the site down.

import routes from './routes.json';
import { prepare, decide, acceptsHtmlPage } from './_negotiation.js';

const CTX = prepare(routes);

const MD_HEADERS = {
  'Content-Type': 'text/markdown; charset=utf-8',
  'Vary': 'Accept, Accept-Encoding',
  'X-Content-Type-Options': 'nosniff',
};

export async function onRequest(context) {
  const { request, next, env } = context;
  try {
    return await handle(request, next, env);
  } catch {
    return next();
  }
}

async function handle(request, next, env) {
  const url = new URL(request.url);
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    path = url.pathname;
  }
  const method = request.method;
  const accept = request.headers.get('Accept') || '';

  const d = decide({ path, method, accept }, CTX);

  switch (d.action) {
    case 'md-asset': {
      const res = await next();
      if (!res.ok) return res;
      return withHeaders(res, {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Vary': 'Accept-Encoding',
        'X-Content-Type-Options': 'nosniff',
        // Every page has a .md twin at a real URL. Served bare, that is a 200
        // text/markdown duplicate of the HTML page — the exact shape Google
        // files under "Page indexed without content". Nothing links them today,
        // so this is prevention, not repair. noindex does not block fetching,
        // so agents and LLMs still get the Markdown; only the search index is
        // told to skip it. The canonical HTML URL is unaffected: the
        // 'markdown-page' branch below (a .md representation served AT the page
        // URL) deliberately does not carry this header.
        'X-Robots-Tag': 'noindex',
      });
    }

    case 'markdown-page': {
      const served = await serveMarkdown(env, url, d.mdPath, method);
      if (served) return served;
      return addVaryAccept(await next()); // .md unavailable → fall back to HTML
    }

    case 'html-page':
      return addVaryAccept(await next());

    case 'not-acceptable':
      return new Response(
        `# 406 Not Acceptable\n\nThis page is available as HTML (\`text/html\`) or ` +
          `Markdown (\`text/markdown\`).\n`,
        { status: 406, headers: MD_HEADERS }
      );

    case 'not-found':
      return notFound(env, url, d.pref, accept);

    case 'passthrough':
    default:
      return next();
  }
}

async function serveMarkdown(env, url, mdPath, method) {
  try {
    const mdReq = new Request(new URL(mdPath, url.origin), { method });
    const res = await env.ASSETS.fetch(mdReq);
    if (!res.ok) return null;
    const ct = res.headers.get('Content-Type') || '';
    // Guard against the SPA fallback sneaking in as HTML.
    if (ct.includes('text/html')) return null;
    return new Response(method === 'HEAD' ? null : res.body, {
      status: 200,
      headers: { ...MD_HEADERS, 'Link': `<${canonical(url)}>; rel="canonical"` },
    });
  } catch {
    return null;
  }
}

// A real browser (pref !== 'markdown') gets the styled HTML 404 page; agents,
// `curl`, `*/*`, and Markdown requesters get the Markdown body.
async function notFound(env, url, pref, accept) {
  if (pref !== 'markdown' && acceptsHtmlPage(accept)) {
    try {
      const res = await env.ASSETS.fetch(new Request(new URL('/404.html', url.origin)));
      if (res.ok) {
        return new Response(res.body, {
          status: 404,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Robots-Tag': 'noindex',
            'Cache-Control': 'no-store',
            'Vary': 'Accept',
          },
        });
      }
    } catch {
      /* fall through to the Markdown body */
    }
  }

  const body =
    `# 404 — Page not found\n\n` +
    `\`${url.pathname}\` does not exist on shanegring.com.\n\n` +
    `Find your way from here:\n\n` +
    `- Sitemap (XML): https://shanegring.com/sitemap.xml\n` +
    `- All pages (human): https://shanegring.com/sitemap\n` +
    `- Agent guide: https://shanegring.com/llms.txt\n` +
    `- Guides: https://shanegring.com/guides/\n` +
    `- Work with me: https://shanegring.com/work-with-me\n` +
    `- Contact: https://shanegring.com/contact\n`;

  return new Response(body, {
    status: 404,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Robots-Tag': 'noindex',
      'Cache-Control': 'no-store',
      'Vary': 'Accept',
    },
  });
}

function addVaryAccept(res) {
  const existing = res.headers.get('Vary');
  if (existing && /(^|,\s*)accept(\s*,|$)/i.test(existing)) return res;
  const value = existing ? `${existing}, Accept` : 'Accept';
  const out = new Response(res.body, res);
  out.headers.set('Vary', value);
  return out;
}

function withHeaders(res, headers) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}

function canonical(url) {
  return `https://shanegring.com${url.pathname}`;
}
