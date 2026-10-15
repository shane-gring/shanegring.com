/**
 * Handled intake — Apps Script web app.
 *
 * Receives the POSTs the site makes to HANDLED_SHEET_URL, at both ends of the
 * job:
 *
 *   kind: "handled-paid"    from functions/api/stripe-handled.js when Stripe
 *                           says someone bought. Files the purchase and emails
 *                           Shane the intake link to send on.
 *   kind: "handled-request" from functions/api/handled/request.js when
 *                           someone asks for a build at /handled/start,
 *                           before paying anything. Files the request, tells
 *                           Shane, and emails them their intake link.
 *   kind: "handled-intake"  from functions/api/handled/submit.js when they
 *                           finish the form. Appends a row, emails Shane the
 *                           brief, and emails the client a short confirmation.
 *
 * This mirrors scan-lead-appsscript.gs. Same pattern, same account, same
 * reason: the site has no transactional mail provider, and MailApp is free,
 * already trusted by Gmail for this domain, and deployable without touching
 * Cloudflare.
 *
 * The payload it receives:
 *   {
 *     kind: "handled-intake",
 *     business, email, submittedAt, template,
 *     summary,      // pre-rendered plain text — this IS the email to Shane
 *     transcript,   // the recording as text, or "" 
 *     record        // the full structured submission
 *   }
 *
 * Shane's email is deliberately plain text. He reads these on a phone between
 * jobs and builds from them directly; the summary is already wrapped to 68
 * columns by functions/lib/handled-summary.js, so HTML would only get in the
 * way. Do not "improve" it into a styled template without checking it still
 * reads on a narrow screen.
 *
 * SETUP: see HANDLED-INTAKE-SETUP.md in the repo root.
 */

var SHANE = 'shane@shanegring.com';
var SHEET_NAME = 'Handled intake';
var PAID_SHEET_NAME = 'Handled paid';
var REQUEST_SHEET_NAME = 'Handled requests';

// ---------- entry point ----------

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);

    // The same web app URL could be pointed at by something else one day.
    // Refuse anything that is not ours rather than filing it wrongly.
    //
    // Two kinds arrive here, at the two ends of the job: 'handled-paid' when
    // Stripe says someone bought, and 'handled-intake' when they finish the
    // form. Same script because it is the same client and the same inbox.
    if (d.kind === 'handled-paid') {
      appendPaidRow_(d);
      notifyShanePaid_(d);
      emailBuyerLink_(d);
      return json_({ ok: true });
    }

    if (d.kind === 'handled-request') {
      appendRequestRow_(d);
      notifyShaneRequest_(d);
      emailRequesterLink_(d);
      return json_({ ok: true });
    }

    if (d.kind !== 'handled-intake') {
      return json_({ ok: false, error: 'unexpected kind: ' + d.kind });
    }

    appendRow_(d);
    notifyShane_(d);
    if (d.email) confirmClient_(d);

    return json_({ ok: true });
  } catch (err) {
    // Never throw: submit.js treats this as best-effort and the client has
    // already been told they are done. Failing loudly here would only mean a
    // retry storm against a script that is already broken.
    console.error('handled-intake: ' + err);
    return json_({ ok: false, error: String(err) });
  }
}

// ---------- sheet ----------

function appendRow_(d) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Submitted', 'Business', 'Email', 'Phone', 'Domain',
      'One line', 'Template', 'Recording', 'Transcript', 'Files',
    ]);
    sheet.setFrozenRows(1);
  }

  var a = (d.record && d.record.answers) || {};
  var uploads = (d.record && d.record.uploads) || {};
  var rec = (uploads.recording || [])[0];

  sheet.appendRow([
    d.submittedAt || new Date().toISOString(),
    d.business || '',
    d.email || '',
    a.phone || '',
    a.domain || '',
    a.one_liner || '',
    d.template || '',
    rec ? mmss_(rec.durationSec) : '',
    d.transcript || '',
    countFiles_(uploads) + ' file(s)',
  ]);
}

function countFiles_(uploads) {
  var n = 0;
  for (var k in uploads) n += (uploads[k] || []).length;
  return n;
}

function mmss_(s) {
  if (!s && s !== 0) return '';
  return Math.floor(s / 60) + ':' + ('0' + Math.round(s % 60)).slice(-2);
}

// ---------- someone paid ----------

function appendPaidRow_(d) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PAID_SHEET_NAME) || ss.insertSheet(PAID_SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Paid', 'Name', 'Email', 'Amount', 'Intake link', 'Sent', 'Stripe session', 'Off-Stripe']);
    sheet.setFrozenRows(1);
  }

  // The link goes in the sheet as well as the email because the email is the
  // thing most likely to be lost, and the token cannot be read back out of
  // storage — it is stored hashed. Losing both means re-issuing.
  //
  // "Off-Stripe" is a new last column rather than inserted among the rest, so
  // existing columns keep their position. Blank for a real Stripe purchase;
  // 'off-Stripe' for a link issued by hand for someone paying another way.
  sheet.appendRow([
    d.paidAt || new Date().toISOString(),
    d.name || '',
    d.email || '',
    d.amount || '',
    d.url || '',
    '',
    d.session || '',
    d.source === 'manual' ? 'off-Stripe' : '',
  ]);
}

function notifyShanePaid_(d) {
  var manual = d.source === 'manual';
  var who = d.name || d.email || 'Someone';
  var subject = manual
    ? 'Handled: ' + who + ' (off-Stripe) — send them their intake link'
    : 'Handled: ' + who + ' paid — send them their intake link';

  var body =
    who + (manual ? ' is in (off-Stripe)' : ' just bought Handled' + (d.amount ? ' (' + d.amount + ')' : '')) + '.\n\n' +
    'Send them this link. It is the only copy — the token is stored hashed, so\n' +
    'it cannot be recovered if it is lost. Re-issue instead.\n\n' +
    d.url + '\n\n' +
    '────────────────────────────────\n' +
    'Name   ' + (d.name || '—') + '\n' +
    'Email  ' + (d.email || '—') + '\n' +
    'Paid   ' + (d.paidAt || '—') + '\n';

  MailApp.sendEmail({ to: SHANE, subject: subject, body: body });
}

// ---------- the buyer's copy of their link ----------
//
// Checkout drops them straight into the intake, so this is not how they get
// in — it is how they get back in. Most people will not finish in one sitting,
// and the link is unrecoverable: the token is stored hashed, so a lost link is
// a re-issue, not a lookup. Hence "save this email".
//
// Sent from Shane's own address rather than a no-reply, because a reply to it
// should reach a person. Failure here must not fail the request: the row is
// already written and Shane has been told, so a bounced buyer email is a thing
// to notice in the log, not a reason for Stripe to retry the whole webhook.

function emailBuyerLink_(d) {
  if (!d.email) return;

  var first = String(d.name || '').trim().split(/\s+/)[0];
  var hello = first ? 'Hi ' + first + ',' : 'Hi,';

  var body =
    hello + '\n\n' +
    'Thank you — you are in, and your site is on my desk.\n\n' +
    'Here is your intake link. Save this email: it is the only copy, and it is\n' +
    'the way back to your answers if you close the tab.\n\n' +
    d.url + '\n\n' +
    'It takes about fifteen minutes and it saves as you go, so you can stop and\n' +
    'come back on your phone. Once it is in, your first draft follows in a few\n' +
    'business days.\n\n' +
    'Anything at all, just reply to this.\n\n' +
    'Shane\n' +
    'shanegring.com/handled\n';

  try {
    MailApp.sendEmail({
      to: d.email,
      subject: 'Your Handled intake link — save this email',
      body: body,
      name: 'Shane Gring',
      replyTo: SHANE,
    });
  } catch (err) {
    console.error('buyer email failed for ' + d.email + ': ' + err);
  }
}

// ---------- someone asked for a build (not paid) ----------
//
// From /handled/start: the build-first campaign. They have not paid, and the
// checkout link goes out with the draft. They are already in the form by the
// time this runs (the page sends them straight there), so their email is the
// way back in, the same job emailBuyerLink_ does for a buyer.

function appendRequestRow_(d) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(REQUEST_SHEET_NAME) || ss.insertSheet(REQUEST_SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Requested', 'Name', 'Email', 'Business', 'Current site', 'Campaign', 'Intake link', 'Draft sent', 'Paid']);
    sheet.setFrozenRows(1);
  }

  // The link goes in the sheet for the same reason as on 'Handled paid': it is
  // stored hashed and cannot be read back out. "Draft sent" and "Paid" are
  // Shane's to fill in by hand.
  sheet.appendRow([
    d.requestedAt || new Date().toISOString(),
    d.name || '',
    d.email || '',
    d.business || '',
    d.website || '',
    d.campaign || '',
    d.url || '',
    '',
    '',
  ]);
}

function notifyShaneRequest_(d) {
  var who = d.business || d.name || d.email || 'Someone';
  var body =
    (d.name || 'Someone') + (d.business ? ' at ' + d.business : '') + ' asked for a Handled build.\n' +
    'Not paid yet: you will get their brief when they finish the intake. Send\n' +
    'the checkout link with the draft.\n\n' +
    'Their intake link (already emailed to them, and it is the only copy):\n' +
    d.url + '\n\n' +
    '────────────────────────────────\n' +
    'Name      ' + (d.name || '—') + '\n' +
    'Email     ' + (d.email || '—') + '\n' +
    'Business  ' + (d.business || '—') + '\n' +
    'Site      ' + (d.website || '—') + '\n' +
    'Campaign  ' + (d.campaign || '—') + '\n';

  MailApp.sendEmail({
    to: SHANE,
    subject: 'Handled request: ' + who + ' (not paid)',
    body: body,
    replyTo: d.email || SHANE,
  });
}

function emailRequesterLink_(d) {
  if (!d.email) return;

  var first = String(d.name || '').trim().split(/\s+/)[0];
  var hello = first ? 'Hi ' + first + ',' : 'Hi,';

  var body =
    hello + '\n\n' +
    'Thanks for asking. Here is your intake link. Save this email: it is the\n' +
    'only copy, and it is the way back to your answers if you close the tab.\n\n' +
    d.url + '\n\n' +
    'It takes about fifteen minutes and it saves as you go, so you can stop and\n' +
    'come back on your phone. Once it is in, I build your page and send you a\n' +
    'draft in a few business days.\n\n' +
    'You pay nothing until you have seen it. If you like it, the build is $300\n' +
    'once and $200 a month after that. If you do not, you owe me nothing.\n\n' +
    'Anything at all, just reply to this.\n\n' +
    'Shane\n' +
    'shanegring.com/handled\n';

  try {
    MailApp.sendEmail({
      to: d.email,
      subject: 'Your Handled intake link — save this email',
      body: body,
      name: 'Shane Gring',
      replyTo: SHANE,
    });
  } catch (err) {
    console.error('requester email failed for ' + d.email + ': ' + err);
  }
}

// ---------- Shane's brief ----------

function notifyShane_(d) {
  var subject = 'Handled intake: ' + (d.business || d.email || 'new client') +
    (d.source === 'request' ? ' (not paid)' : '');

  // The summary already contains everything, formatted. All this adds is a
  // line at the top saying what to do next, because an email that opens with
  // an action is easier to act on than one that opens with a heading.
  var body =
    'A Handled client has finished their intake. Everything you need to build ' +
    'their page is below — the files are links, and the recording has been ' +
    'transcribed.\n\n' +
    '────────────────────────────────\n\n' +
    d.summary;

  MailApp.sendEmail({
    to: SHANE,
    subject: subject,
    body: body,
    name: 'Handled intake',
    replyTo: d.email || SHANE,   // replying goes straight to the client
  });
}

// ---------- the client's confirmation ----------

function confirmClient_(d) {
  var first = (d.business || '').trim();

  var body =
    'Thanks' + (first ? ', ' + first : '') + ' — that\'s everything I need.\n\n' +
    'I build from your answers directly, so there\'s nothing else for you to ' +
    'do right now. You\'ll hear from me in a few business days with a first ' +
    'look at your page.\n\n' +
    (d.source === 'request'
      ? 'Nothing to pay until you have seen it and want it live.\n\n'
      : '') +
    'After that, changing anything is as easy as replying to that email.\n\n' +
    'Shane\n' +
    SHANE + '\n' +
    'https://shanegring.com/handled\n';

  MailApp.sendEmail({
    to: d.email,
    subject: 'Got it — your page is underway',
    body: body,
    name: 'Shane Gring',
    replyTo: SHANE,
  });
}

// ---------- helpers ----------

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- test harness ----------

/**
 * Run this from the Apps Script editor after deploying, to prove the sheet
 * write and both emails work without needing a real client to submit.
 * It sends to SHANE twice — once as the brief, once as the "client" copy.
 */
function runHandledTest() {
  doPost({
    postData: {
      contents: JSON.stringify({
        kind: 'handled-intake',
        business: 'Test Plumbing Co',
        email: SHANE,
        submittedAt: new Date().toISOString(),
        template: 'template-02',
        transcript: 'This is a test transcript, not a real client.',
        summary:
          'HANDLED INTAKE — Test Plumbing Co\n\n' +
          '──────────────────────────────────\n' +
          'THE BASICS\n\n' +
          'Business name.\n    Test Plumbing Co\n\n' +
          'If you are reading this, the wiring works.\n',
        record: {
          answers: { business_name: 'Test Plumbing Co', email: SHANE, one_liner: 'A test' },
          uploads: { recording: [{ name: 'recording.m4a', durationSec: 312 }] },
        },
      }),
    },
  });
}
