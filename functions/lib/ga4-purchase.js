/**
 * Report a completed Stripe checkout to GA4 as `purchase`, server-side.
 *
 * Why here and not in the browser: the buyer's return URL carries the Stripe
 * session id, and /api/handled/claim treats that id as a credential — it
 * trades it for the intake token. Putting GTM on that page would ship the id
 * (or, after the swap, the token in the fragment) to Analytics as
 * page_location. The webhook already has the amount, currency and session id,
 * fires for every link whether or not the buyer comes back to the site, and
 * cannot be blocked by an ad blocker.
 *
 * The cost is session attribution: GA4 sees this purchase as its own client,
 * not stitched to the visit that clicked the link. The UTM trail that /handled
 * packs into client_reference_id (source__campaign__content) is sent along as
 * event parameters, so the source of a sale is still readable.
 *
 * Bindings (both absent = silently off):
 *   GA4_MEASUREMENT_ID   var     G-…
 *   GA4_API_SECRET       secret  GA4 Admin → Data streams → Measurement Protocol API secrets
 */

const MP_URL = 'https://www.google-analytics.com/mp/collect';

// A replayed webhook must not double-count revenue. GA4 dedupes on
// transaction_id only loosely, so a marker per session makes it exact.
const SENT_PREFIX = 'ga4/purchases';

export async function reportPurchase(env, event) {
  if (!env.GA4_MEASUREMENT_ID || !env.GA4_API_SECRET) return;

  const session = event.data?.object || {};
  // Test-mode checkouts are how the flow gets exercised; keep them out of revenue.
  if (!event.livemode || !session.id) return;
  if (session.payment_status && session.payment_status !== 'paid') return;

  const marker = `${SENT_PREFIX}/${session.id}`;
  if (env.HANDLED_BUCKET && (await env.HANDLED_BUCKET.head(marker))) return;

  const [source, campaign, content] = String(session.client_reference_id || '').split('__');
  const currency = String(session.currency || 'usd').toUpperCase();
  const value = Number(session.amount_total || 0) / 100;

  const body = {
    // Deterministic, so a retry that slips past the marker lands on the same client.
    client_id: `stripe.${session.id.slice(-20)}`,
    events: [
      {
        name: 'purchase',
        params: {
          transaction_id: session.id,
          value,
          currency,
          payment_link: String(session.payment_link || ''),
          checkout_source: source || '',
          checkout_campaign: campaign || '',
          checkout_content: content || '',
          items: [{ item_id: String(session.payment_link || 'stripe'), item_name: 'Stripe checkout', price: value, quantity: 1 }],
        },
      },
    ],
  };

  const url = `${MP_URL}?measurement_id=${encodeURIComponent(env.GA4_MEASUREMENT_ID)}&api_secret=${encodeURIComponent(env.GA4_API_SECRET)}`;
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) {
    console.log(`ga4-purchase: MP returned ${res.status} for ${session.id}`);
    return;
  }

  if (env.HANDLED_BUCKET) {
    await env.HANDLED_BUCKET.put(marker, JSON.stringify({ at: new Date().toISOString(), value, currency }), {
      httpMetadata: { contentType: 'application/json' },
    });
  }
}
