/**
 * Site Readiness Scan: lead capture + email (Google Apps Script).
 *
 * Container-bound to the "Leads from AI scan" Sheet (owned by
 * shane.gring@certainly.coop), deployed as a Web App whose /exec URL is the
 * Cloudflare var LEAD_SHEET_URL. The scan Worker POSTs the full result:
 *   { email, site, url, overall,
 *     lenses:[{title,score,read}], opportunities:[{title,detail}], at }
 *
 * doPost: (1) appends the lead row, (2) emails Shane a compact lead alert,
 * (3) emails the visitor a branded HTML copy of their scan (with a plain-text
 * fallback). Sheet columns: at | email | site | overall | lenses |
 * opportunities | stage | stopped. stage/stopped drive the Scan -> Read
 * nurture sequence (see sendSequence below; spec: SCAN-NURTURE-SEQUENCE.md).
 *
 * /handled-card sends a second, smaller payload — { kind: 'handled-card',
 * email, ref, at } — routed at the top of doPost to handledCard_(), which
 * logs to its own "Handled card" tab (created on first use) rather than
 * mixing into the scan's row shape, and sends Shane and the visitor each a
 * short plain-text email.
 *
 * DEPLOY: paste over the whole script, Save, then
 *   Deploy -> Manage deployments -> edit the existing deployment ->
 *   Version: New version -> Deploy. Approve the Gmail authorization prompt
 *   (choose the shane@shanegring.com account; if you see "unverified app",
 *   Advanced -> Allow). Editing the existing deployment keeps the same /exec
 *   URL, so Cloudflare needs no change.
 * SEQUENCE: add a daily time-driven trigger on sendSequence
 *   (Triggers -> Add Trigger -> sendSequence -> time-driven -> day timer).
 *   Run runSequenceTest() once from the editor first; it emails the result.
 */

var NOTIFY_TO = 'shane@shanegring.com';
var FROM_NAME = 'Shane Gring';
var SITE_URL = 'https://shanegring.com';

// ---------- helpers ----------

function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Score band color: the only color in an otherwise monochrome email.
function band_(n) {
  n = Number(n) || 0;
  if (n >= 75) return '#1a7f37'; // green
  if (n >= 50) return '#565656'; // neutral gray
  return '#b45309';              // warm amber
}

function chip_(score) {
  var n = Number(score) || 0;
  return '<span style="display:inline-block;padding:3px 12px;border-radius:999px;' +
    'background-color:' + band_(n) + ';color:#ffffff;font-size:13px;font-weight:700;' +
    'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;">' +
    n + '</span>';
}

function scoreBar_(overall) {
  var n = Math.max(0, Math.min(100, Number(overall) || 0));
  var fill = '<td width="' + n + '%" style="background-color:' + band_(n) +
    ';height:6px;line-height:6px;font-size:1px;">&nbsp;</td>';
  var rest = n >= 100 ? '' :
    '<td width="' + (100 - n) + '%" style="background-color:#e5e5e5;height:6px;line-height:6px;font-size:1px;">&nbsp;</td>';
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 0;"><tr>' +
    fill + rest + '</tr></table>';
}

// ---------- visitor email (HTML) ----------

function visitorHtml_(d) {
  var FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  var site = esc_(d.site);
  var url = esc_(d.url || ('https://' + d.site));
  var overall = Number(d.overall) || 0;

  var lenses = (d.lenses || []).map(function (l) {
    return '' +
      '<tr><td style="padding:26px 0 0;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
      '<td style="font-family:' + FONT + ';font-size:17px;font-weight:700;color:#111111;">' + esc_(l.title) + '</td>' +
      '<td align="right" style="white-space:nowrap;">' + chip_(l.score) + '</td>' +
      '</tr></table>' +
      '<p style="margin:10px 0 0;font-family:' + FONT + ';font-size:15px;line-height:1.6;color:#404040;">' +
      esc_(l.read) + '</p>' +
      '</td></tr>';
  }).join('');

  var opps = (d.opportunities || []).map(function (o) {
    // Older payloads have no guide field — render exactly as before.
    var hasGuide = o.guide && o.guide.url;
    return '' +
      '<p style="margin:0 0 4px;font-family:' + FONT + ';font-size:15px;font-weight:700;color:#111111;">' + esc_(o.title) + '</p>' +
      '<p style="margin:0 0 ' + (hasGuide ? '6px' : '16px') + ';font-family:' + FONT + ';font-size:15px;line-height:1.6;color:#404040;">' + esc_(o.detail) + '</p>' +
      (hasGuide ?
        '<p style="margin:0 0 16px;font-family:' + FONT + ';font-size:13px;">' +
        '<a href="' + esc_(o.guide.url) + '" style="color:#111111;">Read the guide: ' + esc_(o.guide.title || 'the guide') + ' &rarr;</a></p>' : '');
  }).join('');

  return '' +
'<!DOCTYPE html><html><body style="margin:0;padding:0;background-color:#fafafa;">' +
// preheader (hidden preview line)
'<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">' +
  'Overall readiness ' + overall + '/100 — where the site is strong, and where to start.' +
'</div>' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafafa;"><tr><td align="center" style="padding:32px 16px;">' +
'<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e5e5e5;">' +

// header
'<tr><td style="padding:28px 36px 0;">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
'<td style="font-family:' + FONT + ';font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">' +
'<a href="' + SITE_URL + '" style="color:#111111;text-decoration:none;">Shane Gring</a></td>' +
'<td align="right" style="font-family:' + FONT + ';font-size:13px;color:#707070;">Site Readiness Scan</td>' +
'</tr></table></td></tr>' +

// score block
'<tr><td style="padding:34px 36px 0;">' +
'<p style="margin:0;font-family:' + FONT + ';font-size:14px;color:#707070;">Overall readiness of <a href="' + url + '" style="color:#111111;">' + site + '</a></p>' +
'<p style="margin:6px 0 0;font-family:' + FONT + ';font-size:56px;line-height:1;font-weight:800;color:#111111;">' + overall +
'<span style="font-size:22px;font-weight:400;color:#707070;">&nbsp;/100</span></p>' +
scoreBar_(overall) +
'</td></tr>' +

// lenses
'<tr><td style="padding:8px 36px 6px;">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + lenses + '</table>' +
'</td></tr>' +

// where to start
'<tr><td style="padding:30px 36px 0;">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
'<td style="background-color:#fafafa;border-left:3px solid #111111;padding:22px 24px 8px;">' +
'<p style="margin:0 0 14px;font-family:' + FONT + ';font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#111111;">Where to start</p>' +
opps +
'</td></tr></table></td></tr>' +

// CTA
'<tr><td style="padding:32px 36px 0;">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
'<td bgcolor="#111111" style="background-color:#111111;padding:28px 28px 30px;">' +
'<p style="margin:0;font-family:' + FONT + ';font-size:18px;font-weight:700;color:#ffffff;">This is the machine version.</p>' +
'<p style="margin:10px 0 0;font-family:' + FONT + ';font-size:15px;line-height:1.6;color:#d4d4d4;">' +
'The Read is me doing it by hand: a 30&ndash;40 minute recorded walkthrough of your site, plus a memo that ranks every fix by effort against impact. Five business days. $1,500, and it credits in full toward the Map.</p>' +
'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 0;"><tr>' +
'<td bgcolor="#ffffff" style="background-color:#ffffff;">' +
'<a href="' + SITE_URL + '/read" style="display:inline-block;padding:12px 24px;font-family:' + FONT + ';font-size:15px;font-weight:700;color:#111111;text-decoration:none;">Book the Read &rarr;</a>' +
'</td></tr></table>' +
'<p style="margin:16px 0 0;font-family:' + FONT + ';font-size:13px;color:#a3a3a3;">Or just reply to this email &mdash; it comes straight to me.</p>' +
'</td></tr></table></td></tr>' +

// footer
'<tr><td style="padding:26px 36px 30px;">' +
'<p style="margin:0;font-family:' + FONT + ';font-size:13px;line-height:1.6;color:#707070;">' +
esc_(FROM_NAME) + ' &middot; Fractional COO &middot; <a href="' + SITE_URL + '" style="color:#707070;">shanegring.com</a></p>' +
'</td></tr>' +

'</table></td></tr></table></body></html>';
}

// Plain-text fallback: no hard wraps, let the client wrap.
function visitorText_(d) {
  var lensBlock = (d.lenses || []).map(function (l) {
    return l.title + ' (' + l.score + '/100)\n' + (l.read || '');
  }).join('\n\n');
  var oppBlock = (d.opportunities || []).map(function (o) {
    return o.title + '\n' + (o.detail || '') +
      (o.guide && o.guide.url ? '\nGuide: ' + o.guide.url : '');
  }).join('\n\n');
  return 'Your Site Readiness Scan of ' + (d.url || d.site) + '\n\n' +
    'Overall readiness: ' + d.overall + '/100\n\n' +
    lensBlock + '\n\nWHERE TO START\n\n' + oppBlock + '\n\n' +
    'This is the machine version. The Read is me doing it by hand: a recorded walkthrough of your site plus a ranked memo of fixes, in 5 business days. $1,500, credits in full toward the Map. ' +
    SITE_URL + '/read\n\nOr just reply to this email.\n\n' +
    FROM_NAME + '\n' + SITE_URL;
}

// ---------- lead alert to Shane ----------

function notifyHtml_(d, rowUrl) {
  var FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  var scores = (d.lenses || []).map(function (l) {
    return esc_(l.title) + ' <strong>' + (Number(l.score) || 0) + '</strong>';
  }).join(' &nbsp;&middot;&nbsp; ');
  var top = (d.opportunities || [])[0];
  return '' +
'<div style="font-family:' + FONT + ';font-size:15px;line-height:1.6;color:#111111;max-width:600px;">' +
'<p style="margin:0 0 4px;"><strong>' + esc_(d.email) + '</strong> ran the scan on ' +
'<a href="' + esc_(d.url || ('https://' + d.site)) + '" style="color:#111111;">' + esc_(d.site) + '</a>' +
' &mdash; ' + chip_(d.overall) + '</p>' +
'<p style="margin:12px 0 0;font-size:14px;color:#404040;">' + scores + '</p>' +
(top ? '<p style="margin:16px 0 0;font-size:14px;color:#404040;"><strong style="color:#111111;">Top opportunity:</strong> ' +
  esc_(top.title) + ' &mdash; ' + esc_(top.detail) + '</p>' : '') +
'<p style="margin:16px 0 0;font-size:14px;"><a href="' + rowUrl + '" style="color:#111111;">Open the lead row &rarr;</a></p>' +
'</div>';
}

// ---------- /handled-card lead ----------

function handledCard_(d) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName('Handled card');
  if (!s) {
    s = ss.insertSheet('Handled card');
    s.appendRow(['at', 'email', 'ref', 'status']);
  }
  s.appendRow([d.at, d.email, d.ref || 'card', 'new']);
  var rowUrl = ss.getUrl() + '#gid=' + s.getSheetId() + '&range=A' + s.getLastRow();

  MailApp.sendEmail({
    to: NOTIFY_TO,
    subject: 'Handled card lead: ' + d.email,
    body: d.email + ' scanned the card (ref: ' + (d.ref || 'card') + ') and asked for the build-fee waiver.\n' +
      'Next: issue an intake link with tools/handled-token.mjs and send it.\n' +
      'Row: ' + rowUrl
  });

  MailApp.sendEmail({
    to: d.email,
    name: FROM_NAME,
    replyTo: NOTIFY_TO,
    subject: 'Your site, build fee waived',
    body: 'Thanks for scanning the card.\n\n' +
      'Here is the deal, in writing: a one-page site built to your specs, live in days, changed by email, everything in your name. $200 a month, month to month. The $300 build fee is waived because we met.\n\n' +
      'Next step: within a day I\'ll send you a link to a short intake. It takes about ten minutes and it is the only homework you get.\n\n' +
      'If you have questions before then, reply to this email.\n\n' +
      'Shane\n' +
      'shanegring.com/handled'
  });

  return ContentService.createTextOutput('ok');
}

// ---------- entry point ----------

function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  if (d.kind === 'handled-card') return handledCard_(d);

  // 1) Log the lead (matches existing sheet columns).
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheets()[0];
  s.appendRow([
    d.at,
    d.email,
    d.site,
    d.overall,
    (d.lenses || []).map(function (l) { return l.title + ': ' + l.score; }).join(' | '),
    (d.opportunities || []).map(function (o) { return o.title; }).join(' | '),
    0,   // stage: no sequence emails sent yet (the scan report is email 0)
    ''   // stopped: set to 'stop' / 'no more' / 'bought' / 'replied' to exit
  ]);
  var rowUrl = ss.getUrl() + '#gid=' + s.getSheetId() + '&range=A' + s.getLastRow();

  // 2) Notify Shane (compact lead alert).
  MailApp.sendEmail({
    to: NOTIFY_TO,
    subject: 'New scan: ' + d.site + ' (' + d.overall + '/100) from ' + d.email,
    body: d.email + ' ran the scan on ' + (d.url || d.site) + ' — ' + d.overall + '/100.\n' +
      (d.lenses || []).map(function (l) { return l.title + ': ' + l.score; }).join(' | ') + '\n' +
      'Lead row: ' + rowUrl,
    htmlBody: notifyHtml_(d, rowUrl)
  });

  // 3) Send the visitor their copy.
  if (d.email) {
    MailApp.sendEmail({
      to: d.email,
      name: FROM_NAME,
      replyTo: NOTIFY_TO,
      subject: 'Your Site Readiness Scan: ' + d.site + ' — ' + d.overall + '/100',
      body: visitorText_(d),
      htmlBody: visitorHtml_(d)
    });
  }

  return ContentService.createTextOutput('ok');
}


// ---------- Scan -> Read nurture sequence (daily runner) ----------
// Spec: SCAN-NURTURE-SEQUENCE.md. Sheet columns G/H = stage | stopped.
// stage = how many sequence emails this lead has already received (the
// instant scan report is "email 0", so a fresh row starts at stage 0 and
// gets Email 1 when it is 1 day old). stopped = any non-empty value exits
// the sequence ("stop", "no more", "bought", "replied" - set by hand for
// now: reply = human takes over, buys matched from Stripe receipts).
// Rows carried over from the old sheet: set stage to 'x' so they are
// skipped; enroll one by hand by resetting its stage to 0.

var SEQ_DUE_DAYS = [1, 3, 6, 9, 13]; // days since scan at which emails 1-5 go out
var SEQ_COL_AT = 1;
var SEQ_COL_EMAIL = 2;
var SEQ_COL_SITE = 3;
var SEQ_COL_OVERALL = 4;
var SEQ_COL_STAGE = 7;
var SEQ_COL_STOPPED = 8;
var SEQ_WIDTH = 8;

var SEQ_FOOTER = "\n\nIf you'd rather not hear about this, reply 'no more' and that's the end of it.";

function seqLink_(n) {
  return 'https://shanegring.com/read?utm_source=scan-nurture&utm_campaign=read&utm_content=e' + n;
}

function seqTemplates_(site, score) {
  return [
    {
      subject: "The one thing your scan couldn't check",
      body:
`Yesterday a machine read ${site} and gave it a ${score}.

Here's what that number covers: structure. Whether AI can crawl you, whether your pages carry real markup, whether your content lives where machines can find it.

Here's what it can't cover: whether any of it is still true.

A scan can verify your schema. It can't know that your best offer changed last spring, that your prices moved, that the client you built the homepage around is one you'd never take today.

Try this — it takes two minutes. Open your homepage and read it as a stranger. Not as the person who wrote it. As someone deciding whether to spend money with you this week.

If the words are two years old, the score is the smaller problem.

That deeper check is what the Read is - my eyes on your site, not a machine's. It's here when you want it: ${seqLink_(1)}

Shane
https://shanegring.com`
    },
    {
      subject: 'Your website describes a company that no longer exists',
      body:
`The day your site launched, it was true.

Then you sharpened an offer. Raised a price. Landed a flagship client. Killed a service line that wasn't working. The business moved. The site didn't.

That's not neglect — it's the ordinary motion of a business nobody assigned to keep the surface in sync. Every founder-led company I've been inside has some version of it.

It used to cost you slowly: prospects land, bounce off stale language, move on. Now it costs you twice — because more and more of them never land at all. They ask an AI about you, and the AI answers from whatever your old pages say. Or it guesses.

One fix worth making this week: find the single page on ${site} that's most wrong about who you are now, and rewrite its first paragraph. Just that.

If you'd rather see the whole gap at once — ranked, with the three fixes that matter most — that's the Read: ${seqLink_(2)}

Shane`
    },
    {
      subject: "Ask an AI about your business. I'll wait.",
      body:
`Here's an exercise I run for clients. You can run it yourself right now.

Open whichever AI you use and ask it, one at a time:

1. What does ${site} do?
2. Who are their typical clients?
3. What do they cost?
4. How do they compare to [your closest competitor]?
5. Best [your category] for [your ideal buyer] — and see if you appear at all.

Read the answers slowly. Every wrong answer is a prospect conversation that ends before it starts — or starts with you correcting the record. Every empty answer is a question your competitor may be answering instead.

This is the part of the Read people forward to their partners: I ask the engines the questions your prospects ask, on camera, and you watch what comes back. Then the memo shows why — which pages, which gaps, which fixes.

If the exercise above stung, the full version is here: ${seqLink_(3)}

Shane`
    },
    {
      subject: `What I'd find on ${site} in five days`,
      body:
`No exercise today. Just what the Read is, plainly, in case it's useful:

- A 30 to 40 minute video of me going through ${site} page by page. Not a template. Not a score. Me, reading your business the way an operator does and your site the way a machine does, showing you where the two don't match.

- A memo you can act on the same day. Every issue ranked by effort against impact. Three fixes marked that you can ship this week with whoever runs your site — no help from me needed.

- What the AI engines say about you, on screen, with the reasons why.

Five business days. No meetings — you answer five questions, I do the rest. The price is on the page, so you don't need a call to learn it.

Two things I hold myself to. If the Read doesn't show you something material you didn't already know, reply to the delivery email and I refund you in full. And if I look at your situation and conclude it isn't worth the fee, I refund you before I start and tell you why. Findings are only worth something if I'm not paid to manufacture them.

${seqLink_(4)}

Shane`
    },
    {
      subject: 'Last one from me on this',
      body:
`This is the last email I'll send you about the Read, so let me be straight about who it's not for.

If you're pre-revenue, mid-rebuild, or you win all your work through relationships and the site genuinely doesn't matter — skip it. Keep the scan, fix what it flagged, and good luck out there. I mean that.

But if the business has outgrown the site - if the real story lives in your head and the pages tell an older one — know that this gap doesn't hold still. The business keeps moving. The site keeps standing still. And the engines keep answering questions about you from whatever they can find.

One more thing worth knowing: the Read's fee applies in full toward the Map for 30 days after delivery. If this goes further, the diagnostic was free. If it doesn't, you own a memo built to work without me.

Either way — run the scan again in six months and see which way ${site} moved.

${seqLink_(5)}

Shane
https://shanegring.com`
    }
  ];
}

// Daily entry point. Sends at most one email per lead per run, to the leads
// whose next email came due since the last run. Returns a log string.
function sendSequence() {
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var lastRow = s.getLastRow();
  if (lastRow < 2) return 'no rows';
  var vals = s.getRange(2, 1, lastRow - 1, SEQ_WIDTH).getValues();
  var now = Date.now();
  var sent = [];
  for (var i = 0; i < vals.length; i++) {
    var row = vals[i];
    var stage = row[SEQ_COL_STAGE - 1];
    if (typeof stage !== 'number' || stage < 0 || stage >= SEQ_DUE_DAYS.length) continue; // done or 'x' legacy
    if (row[SEQ_COL_STOPPED - 1]) continue;
    var email = String(row[SEQ_COL_EMAIL - 1] || '').trim();
    if (!email) continue;
    var at = new Date(row[SEQ_COL_AT - 1]);
    if (isNaN(at.getTime())) continue;
    var days = (now - at.getTime()) / 86400000;
    if (days < SEQ_DUE_DAYS[stage]) continue;
    var tpl = seqTemplates_(String(row[SEQ_COL_SITE - 1] || ''), row[SEQ_COL_OVERALL - 1])[stage];
    MailApp.sendEmail({
      to: email,
      name: FROM_NAME,
      replyTo: NOTIFY_TO,
      subject: tpl.subject,
      body: tpl.body + SEQ_FOOTER
    });
    s.getRange(i + 2, SEQ_COL_STAGE).setValue(stage + 1);
    sent.push(email + ' e' + (stage + 1));
  }
  return sent.length ? sent.join(', ') : 'nothing due';
}

// One-shot pre-flight test: appends a dummy row dated yesterday, addressed
// to Shane, runs the daily pass, and emails the result. After it lands,
// delete the example.com row so it never enters the live sequence.
function runSequenceTest() {
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var yesterday = new Date(Date.now() - 86400000).toISOString();
  s.appendRow([yesterday, NOTIFY_TO, 'example.com', 62, 'test', 'test', 0, '']);
  var result = sendSequence();
  MailApp.sendEmail({
    to: NOTIFY_TO,
    name: FROM_NAME,
    replyTo: NOTIFY_TO,
    subject: 'Scan sequence test: ' + result,
    body: 'sendSequence returned: ' + result + '\n\nIf email 1 ("The one thing your scan couldn\'t check") also arrived, the sequence works. Delete the example.com row in the sheet now.'
  });
  return result;
}
