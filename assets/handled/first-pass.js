/* ══════════════════════════════════════════════════════════════════════════
   The free first pass sign-up form. One script for every /handled/first-pass
   page, so a field, a message or the tracking changes in one place.

   Finds the one form marked [data-first-pass] (in the hero, in place of the
   ad image), posts an email and an optional current site to
   /api/handled/request, and sends the visitor straight into their intake.
   The link also arrives by email, so the redirect is the way in and the email
   is the way back. With JS off the form does nothing; each page has a
   noscript line with an address to email instead.

   Sends along the page path and the arriving UTMs, so Shane's sheet says
   which ad and which page each request came from.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // LinkedIn "Handled – first pass sign-up" conversion. Event-specific, set
  // up by hand in Campaign Manager; fires only after the server accepts the
  // sign-up. Set to null to switch it off. The intake-submitted conversion
  // lives in assets/handled/app.js.
  var LI_SIGNUP_CONVERSION = 31764706;

  var form = document.querySelector('form[data-first-pass]');
  if (!form) return;
  var button = form.querySelector('button[type="submit"]');
  var status = form.querySelector('[data-first-pass-status]');

  function say(text) {
    status.textContent = text;
    status.hidden = !text;
  }

  var q = new URLSearchParams(window.location.search);
  var utm = { source: q.get('utm_source') || '', campaign: q.get('utm_campaign') || '', content: q.get('utm_content') || '' };

  // Arriving with #start (every button on the page links there) puts the
  // cursor in the first field, so the next thing they do is type.
  function focusFirst() {
    if (window.location.hash === '#start') {
      var first = form.elements.email;
      if (first) first.focus({ preventScroll: true });
    }
  }
  window.addEventListener('hashchange', focusFirst);
  focusFirst();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = form.elements;
    var email = f.email.value.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say('That email doesn’t look right.'); f.email.focus(); return; }

    say('');
    button.disabled = true;
    form.classList.add('sr-form-busy');

    fetch('/api/handled/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        website: f.website.value.trim(),
        company: f.company.value,
        page: window.location.pathname,
        utm: utm
      })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) { return { ok: res.ok, body: body }; });
      })
      .then(function (r) {
        if (!r.ok || !r.body.ok) throw new Error(r.body.error || 'Something went wrong. Email shane@shanegring.com and I’ll send your link.');

        if (window.sgTrackLeadOnce) window.sgTrackLeadOnce('handled_first_pass', { form_name: 'handled_first_pass', lead_source: utm.content || window.location.pathname });
        if (LI_SIGNUP_CONVERSION && window.lintrk) window.lintrk('track', { conversion_id: LI_SIGNUP_CONVERSION });

        if (!r.body.url) { say('Thanks. Check your email for your link.'); return; }
        say('Opening your intake…');
        // A beat for the analytics requests to leave before the page does.
        setTimeout(function () { window.location.href = r.body.url; }, 300);
      })
      .catch(function (err) {
        say(err && err.message && err.message !== 'Failed to fetch' ? err.message : 'Couldn’t reach the server. Check your connection and try again.');
        button.disabled = false;
        form.classList.remove('sr-form-busy');
      });
  });
})();
