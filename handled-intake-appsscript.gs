/**
 * Handled intake — Apps Script web app.
 *
 * Receives the POST that functions/api/handled/submit.js makes to
 * HANDLED_SHEET_URL when a client finishes their intake, and does three
 * things: appends a row to the sheet, emails Shane the brief, and emails the
 * client a short confirmation.
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

// ---------- entry point ----------

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);

    // The same web app URL could be pointed at by something else one day.
    // Refuse anything that is not ours rather than filing it wrongly.
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

// ---------- Shane's brief ----------

function notifyShane_(d) {
  var subject = 'Handled intake: ' + (d.business || d.email || 'new client');

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
    'do right now. You\'ll hear from me within two business days with a first ' +
    'look at your page.\n\n' +
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
