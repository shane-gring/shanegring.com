/* Lead and intent events. Pushed to dataLayer, picked up by GTM, sent to GA4.
   GTM only loads on the production host (see the head snippet on each page), so
   every push here is a harmless no-op on localhost and on preview builds. */
(function () {
  var dl = (window.dataLayer = window.dataLayer || []);

  function push(name, params) {
    var payload = { event: name, page_path: window.location.pathname };
    if (params) {
      for (var k in params) {
        if (Object.prototype.hasOwnProperty.call(params, k)) payload[k] = params[k];
      }
    }
    dl.push(payload);
  }

  // Let page-level scripts (the Scan) fire events without repeating this.
  window.sgTrack = push;

  // One generate_lead per completion per pageview, no matter how many times
  // the source (Tally postMessage, Cal callback) reports it.
  var firedLeads = {};
  function leadOnce(key, params) {
    if (firedLeads[key]) return;
    firedLeads[key] = true;
    push('generate_lead', params);
  }
  window.sgTrackLeadOnce = leadOnce;

  // All forms on the site are Tally embeds now (contact, read intake, the
  // three "inquiry" pages share one Tally form). Tally posts a message to
  // the parent window on real submission; this is what generate_lead should
  // track, not the FormSubmit hash-redirect this site used before the Tally
  // move — no page has set that hash since, so the old check never fired.
  var tallyForms = {
    'MepBpY': { form_name: 'contact', lead_source: 'contact_form' },
    'XxPXPO': { form_name: 'read_intake', lead_source: 'read_intake_form' },
    'yP5L50': { form_name: 'work_inquiry', lead_source: 'inquiry_form' }
  };
  window.addEventListener('message', function (e) {
    var data;
    try {
      data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    } catch (err) {
      return;
    }
    if (!data || data.event !== 'Tally.FormSubmitted') return;
    var formId = data.payload && data.payload.formId;
    var known = formId && tallyForms[formId];
    if (known) leadOnce('tally_' + formId, known);
  });

  // Booking and checkout both leave the site, so the click is the only signal
  // for the external cal.com booking pages (session, map, install). The
  // index.html inline embed reports a real bookingSuccessful separately —
  // see the Cal.com block on that page.
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || typeof el.closest !== 'function') return;

    var booking = el.closest('a[href*="cal.com/shane-gring"], [data-cal-link]');
    if (booking) {
      var link = booking.getAttribute('data-cal-link') || booking.getAttribute('href') || '';
      push('book_call_click', { booking_type: link.split('/').pop(), link_url: link });
      return;
    }

    // Both hosts are Stripe: buy.stripe.com is the default Payment Link
    // domain (the Read), checkout.shanegring.com is the custom one (the
    // Session's block of four). Matching only the first meant every block
    // sale went untracked.
    var checkout = el.closest('a[href*="buy.stripe.com"], a[href*="checkout.shanegring.com"]');
    if (checkout) {
      push('begin_checkout', { link_url: checkout.getAttribute('href') || '' });
    }
  });
})();
