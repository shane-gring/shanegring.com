# Handled intake — provisioning handoff

The intake at `/handled-intake` is **built, tested, and committed**. It does not
work in production yet, and nothing in this repo can make it work, because
every remaining step happens in a Cloudflare dashboard or a Google account
that the people who wrote it do not have access to.

This document is the whole handoff. Work top to bottom.

---

## If you are an AI coding agent reading this

You are probably here because Shane asked you to "finish the Handled intake" or
"get the intake working". Read this section before touching anything.

**What you can do:**

- Read the code. Everything is in `functions/api/handled/`,
  `functions/lib/handled-*.js`, `assets/handled/`, and `handled-intake.html`.
- Run the tests: `node --test tests/*.test.mjs` (24 should pass).
- Run it locally: see [Running it locally](#running-it-locally) below. The whole
  flow works on a laptop with emulated storage.
- Verify each step below once a human has done it, using the check commands.
- Edit `assets/handled/questions.js` and `assets/handled/templates.js`. Those
  are content, not code — questions, sections, order, and the template list all
  live there and need no code changes.

**What you cannot do, and should not attempt:**

- Add or change Cloudflare bindings. That is a dashboard action. If you have a
  `CLOUDFLARE_API_TOKEN` you may be able to create the R2 bucket via
  `wrangler r2 bucket create`, but see the warning immediately below before you
  reach for a config file.
- Deploy the Apps Script. It needs a Google account login.

**⚠️ DO NOT add a `wrangler.toml` or `wrangler.jsonc` to the repo root.**

It is the obvious-looking way to declare these bindings in code, and it will
break the live site. Cloudflare's docs are explicit: once a Pages project has a
Wrangler config file, *that file becomes the source of truth* and the dashboard
becomes read-only for bindings. This project already has bindings configured in
the dashboard that are **not** written down anywhere in this repo — `SCAN_KV`,
`ANTHROPIC_API_KEY`, `ATTIO_API_KEY`, `LEAD_SHEET_URL`, `BEEHIIV_API_KEY`,
`TALLY_SIGNING_SECRET`, `CAL_WEBHOOK_SECRET`, `RB2B_WEBHOOK_SECRET` and more.
A config file declaring only the Handled bindings would take the rest away, and
the Scan, the newsletter signup, and every webhook receiver would stop working.

Use the dashboard. It is four clicks and it cannot take anything down.

Note also: `mcp/wrangler.jsonc` exists, but that is a **separate Worker** with
its own deploy, not this Pages project. Do not use it as precedent.

---

## What state the code is in

| Piece | Status |
|---|---|
| Nine screens, autosave, resume, any-order sections | Done, tested on desktop and iOS Safari |
| Token issue / validate / expire / read-only-after-submit | Done, tested |
| Audio recording in-browser | Done, **confirmed working on iOS Safari** |
| Playback | Done, confirmed on a real phone |
| File uploads | Done; local path tested, presigned path unverified (see R2 below) |
| Transcription | Code done, **never run against the real model** (see AI below) |
| Email to Shane + client | Code done, **never sent a real email** (see Apps Script below) |
| Attio capture | Done, skips cleanly with no key |

Everything degrades to a clear message when a binding is missing. The intake
will not crash without these; it will just do less.

---

## 1. R2 bucket — stores drafts, submissions and uploads

**Without this, the intake returns "The intake isn’t configured yet." and nothing
works at all.** This is the one that matters most.

### 1a. Create the bucket

Dashboard → **R2** → **Create bucket** → name it `handled-intake`.

Location: leave automatic. No public access — files are served through a signed
link handled by `functions/api/handled/file.js`, never directly from the bucket.

### 1b. Bind it to the Pages project

**Workers & Pages** → the `shanegring.com` Pages project → **Settings** →
**Bindings** → **Add** → **R2 bucket**

- Variable name: `HANDLED_BUCKET`
- Bucket: `handled-intake`

Then **redeploy** the project (bindings only take effect on a new deployment —
pushing any commit to `main` will do it).

### 1c. Create an S3 API key pair

Uploads go **browser → R2 directly**, using a presigned S3 PUT. This is not a
stylistic choice: Cloudflare Workers cap a request body at 100 MB, so routing
file bytes through a Function would fail on a large upload. Presigning requires
S3 credentials.

R2 → **Manage R2 API Tokens** → **Create API token**

- Permissions: **Object Read & Write**
- Scope it to the `handled-intake` bucket only
- Save the **Access Key ID** and **Secret Access Key** — the secret is shown once

### 1c-2. Set the bucket's CORS policy

**Skip this and every upload fails in production, while working perfectly in
local review.** The browser PUTs cross-origin to
`<account>.r2.cloudflarestorage.com` and sets a `Content-Type` header, which
forces a CORS preflight. Without a policy the preflight is refused and every
file and every recording dies with an opaque network error.

It cannot show up locally, because local review uploads through
`functions/api/handled/upload-direct.js` — same origin, no preflight.

R2 → the `handled-intake` bucket → **Settings** → **CORS Policy** → **Add**:

```json
[
  {
    "AllowedOrigins": [
      "https://shanegring.com",
      "https://www.shanegring.com"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Add your Pages preview origin (`https://*.shanegring-com.pages.dev`) too if you
intend to test uploads on a preview deployment.

**Check it worked:** upload a logo on the live site. In the browser's Network
tab you should see an `OPTIONS` returning 200 followed by a `PUT` returning 200.
An `OPTIONS` that fails, or a PUT reported as a CORS error, means the policy is
missing or the origin does not match exactly.

### 1d. Add four secrets

Same Bindings screen → **Add** → **Secret** (not plaintext variable), four times:

| Name | Value |
|---|---|
| `R2_ACCOUNT_ID` | Your Cloudflare account ID (right-hand side of the dashboard) |
| `R2_ACCESS_KEY_ID` | From step 1c |
| `R2_SECRET_ACCESS_KEY` | From step 1c |
| `R2_BUCKET` | `handled-intake` |

**Check it worked:**

```bash
curl -s "https://shanegring.com/api/handled/session" -H "X-Handled-Token: nope"
```

- `{"error":"The intake isn’t configured yet."}` → the bucket binding is missing
- `{"error":"invalid_link"}` → **correct.** Storage is working; the token is
  just fake, which is what we sent.

---

## 2. Workers AI binding — transcribes the recording

**Without this, everything still works.** The recording is attached and Shane
gets the audio; he just has to listen to it instead of reading it. The client is
told "Your recording is saved — Shane will listen to it."

This is the cheapest item on the list and the one with no key to copy.

**Workers & Pages** → the Pages project → **Settings** → **Bindings** →
**Add** → **Workers AI**

- Variable name: `AI`

Redeploy. That is the entire step.

### Cost

Workers AI includes **10,000 Neurons per day free on every plan**, including the
free one. Cloudflare publishes Whisper's price as $0.00051 per audio minute but
does not publish its neuron rate; dividing by the $0.011-per-1,000-neurons paid
rate puts it around **46 neurons per audio minute**, so roughly **200+ audio
minutes a day free** — about 40 five-minute recordings. *That figure is derived,
not quoted.* Even if it is off by half, a founding cohort of ten is nowhere near
the ceiling. Transcription should cost nothing.

**Check it worked:** submit a test intake with a recording. The email should
contain a `RECORDED ANSWER` block with real transcribed speech. If it says
"Not transcribed — have a listen", the binding is missing.

---

## 3. Apps Script — sends the emails

**Shane can do this one without anybody's help.** It needs a Google login, not
Cloudflare access.

The site has no transactional mail provider; the Scan already sends its emails
this way and this mirrors it exactly.

1. **Sign in to Google as `shane@shanegring.com`.** This must be the account that
   owns it — mail sends *from* whoever deploys it.
2. Open (or create) a Sheet to hold the leads. One tab is fine; the script
   creates the tab and header row itself.
3. **Extensions → Apps Script.**
4. Paste the entire contents of **`handled-intake-appsscript.gs`** from this
   repo, replacing whatever is there.
5. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Copy the resulting `/exec` URL.
6. Run `runHandledTest` once from the editor. Approve the permissions prompt.
   Two emails should arrive and a row should appear in the sheet.
7. Add the URL to Cloudflare: Pages project → **Settings** → **Bindings** →
   **Add** → **Secret**, named `HANDLED_SHEET_URL`, value the `/exec` URL.
   Redeploy.

**Gotcha:** "Who has access: Anyone" is required — Cloudflare posts to it
unauthenticated. The script itself rejects anything whose `kind` is not
`handled-intake`.

---

## 4. Two more secrets

Same Bindings screen, both **Secret**:

| Name | Value | Why |
|---|---|---|
| `HANDLED_ADMIN_SECRET` | A long random string | Guards `/api/handled/issue`. Without it the route is closed and no links can be issued. |
| `HANDLED_DOWNLOAD_SECRET` | A different long random string | Signs the file links in Shane's email. Falls back to `HANDLED_ADMIN_SECRET` if unset; if **neither** is set, file links are refused outright rather than signed with an empty key. |

Generate them with:

```bash
node -e 'console.log([...crypto.getRandomValues(new Uint8Array(24))].map(b=>b.toString(16).padStart(2,"0")).join(""))'
```

---

## Issuing a client their link

Once the above is done, this is the whole operational flow. There is no admin
UI, by design.

```bash
HANDLED_ADMIN_SECRET='<the secret>' \
  node tools/handled-token.mjs --label "Acme Plumbing" --base https://shanegring.com
```

It prints one URL. Email it to the client. That is it.

The token is stored **hashed**, so it cannot be recovered later — if a client
loses their link, issue a new one rather than trying to look the old one up.
Links last 45 days by default (`--days` to change, minimum 30).

**Token issuance is deliberately manual and knows nothing about Stripe.** A
client who paid and a friend whose fee was waived get the same link the same
way. Do not wire this to a payment webhook without deciding that is what you
want.

---

## Running it locally

Everything except the presigned upload and real transcription works on a laptop
with no Cloudflare account at all.

```bash
# 1. Local secrets (gitignored)
cat >> .dev.vars <<'EOF'
HANDLED_ADMIN_SECRET="local-dev-only-change-me"
HANDLED_TRANSCRIBE_STUB="1"
EOF

# 2. Dev server with emulated R2
npx wrangler@4 pages dev . --port 8788 --ip 127.0.0.1 \
  --r2 HANDLED_BUCKET --compatibility-date=2026-09-08

# 3. In another terminal, issue yourself a link
node tools/handled-token.mjs --label "Local test"
```

`HANDLED_TRANSCRIBE_STUB` returns a canned transcript clearly labelled
`[STUB TRANSCRIPT …]`, so the review screen and the email can be seen without an
AI binding. It is ignored entirely whenever a real `AI` binding exists.

Local uploads go through `functions/api/handled/upload-direct.js` instead of a
presigned URL, because wrangler's R2 simulator has no S3 endpoint. That route
**refuses to run** as soon as real R2 credentials are present, so it cannot
become the production path by accident.

To test on a phone, tunnel it — `getUserMedia` needs a secure context, so a
plain-HTTP LAN address will not work:

```bash
brew install cloudflared
cloudflared tunnel --url http://127.0.0.1:8788 --protocol http2
```

---

## What was never tested, and why

Be honest with yourself about these rather than assuming they work:

| Untested | Why | How to test once provisioned |
|---|---|---|
| Presigned R2 upload | No S3 endpoint exists locally | Upload a file on the live site; check it lands in the bucket |
| Real transcription | No AI binding available | Record a realistic 5 minutes; check the business name is spelled right |
| A real email arriving | No mail provider bound | `runHandledTest` in the Apps Script editor |

The SigV4 presigning code is not merely hoped-at: `tests/handled-presign.test.mjs`
cross-checks its signature against an independent implementation written from
the AWS spec. But agreeing with a second implementation is not the same as R2
accepting it, so treat the first live upload as the real test.

---

## Where the content lives

Nothing below needs a developer.

| To change | Edit |
|---|---|
| Any question, its wording, order, or which section it's in | `assets/handled/questions.js` |
| The welcome and confirmation screens | `assets/handled/questions.js` |
| The template list — add, remove, rename, reorder | `assets/handled/templates.js` |
| Template preview images | Drop PNGs at `/images/handled/templates/` |
| File types and size limits | `assets/handled/uploads.js` |

Nothing in the code assumes how many questions, sections, or templates there
are. After editing, run `node tools/version-assets.mjs` so the change is not
hidden behind Cloudflare's four-hour asset cache, and commit what it rewrites.
