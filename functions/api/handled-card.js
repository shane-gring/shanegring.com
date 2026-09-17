/**
 * Handled card lead capture — Cloudflare Pages Function (POST /api/handled-card)
 *
 * Takes an email off /handled-card (the page behind the QR code on the
 * physical business card) and posts it to the same Apps Script web app the
 * scan uses (LEAD_SHEET_URL), tagged kind: "handled-card". The Apps Script
 * logs the row to its own "Handled card" tab, emails Shane, and emails the
 * visitor a plain confirmation.
 *
 * Required bindings (Cloudflare Pages → Settings):
 *   LEAD_SHEET_URL   var   Apps Script web-app URL (logs row + sends emails)
 */

const DEFAULT_REF = "card";

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function fail(message, status) {
  return json({ ok: false, error: message }, status || 400);
}

function isValidEmail(e) {
  return typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
}

function cleanRef(raw) {
  const s = (typeof raw === "string" ? raw : "").trim().toLowerCase();
  if (!s || s.length > 40 || !/^[a-z0-9_-]+$/.test(s)) return DEFAULT_REF;
  return s;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return fail("Send an email address.");
  }

  // Honeypot. A field named for something a person would never be shown is
  // left empty by anyone using the form and filled by anything walking the
  // DOM. A filled trap gets the same success shape a person gets, and does
  // nothing else.
  if (payload && typeof payload.company === "string" && payload.company.trim() !== "") {
    return json({ ok: true });
  }

  const email = ((payload && payload.email) || "").trim().toLowerCase();
  if (!isValidEmail(email)) return fail("Enter a working email address.");

  const ref = cleanRef(payload && payload.ref);

  if (!env.LEAD_SHEET_URL) {
    console.log("handled-card-health: LEAD_SHEET_URL not configured");
    return fail("Lead capture isn't set up yet. Email shane@shanegring.com.", 503);
  }

  let res;
  try {
    res = await fetch(env.LEAD_SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "handled-card",
        email: email,
        ref: ref,
        at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.log("handled-card-health: lead capture request failed: " + e);
    return fail("Couldn't save that. Email shane@shanegring.com and I'll sort it.", 502);
  }

  if (!res.ok) {
    const body = await res.text().catch(function () { return ""; });
    console.log("handled-card-health: lead capture returned " + res.status + " " + body.slice(0, 200));
    return fail("Couldn't save that. Email shane@shanegring.com and I'll sort it.", 502);
  }

  return json({ ok: true });
}

// Method-specific handlers take precedence; this catches everything else.
export async function onRequest(context) {
  return fail("POST a JSON body with an email.", 405);
}
