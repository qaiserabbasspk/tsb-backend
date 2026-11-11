const axios = require('axios')

const GA4_ENDPOINT = 'https://www.google-analytics.com/mp/collect'

/**
 * Generates a fallback GA client id when the browser one isn't available.
 * GA4 expects the "<random>.<timestamp>" shape used by the _ga cookie.
 */
function generateClientId() {
    return `${Math.floor(Math.random() * 1e10)}.${Math.floor(Date.now() / 1000)}`
}

/**
 * Builds the GA4 ecommerce `items` array from a room document.
 */
function buildItems(room, quantity) {
    if (!room) return []
    return [
        {
            item_id: room.code || String(room._id || ''),
            item_name: room.title || 'Room',
            price: room.price,
            quantity: Math.max(1, Number(quantity) || 1),
        },
    ]
}

/**
 * Sends one or more events to GA4 via the Measurement Protocol. Server-side, so
 * it bypasses ad blockers / browser tracking protection that drop the client tag.
 *
 * Fire-and-forget: callers should not await this in the request path that responds
 * to the guest — log and swallow errors instead, same as other third-party calls
 * in this codebase (Flutterwave verify, X conversion, emailer, etc).
 *
 * Requires GA4_MEASUREMENT_ID and GA4_API_SECRET env vars — skips and logs a
 * warning until they're set.
 *
 * @param {object} params
 * @param {string} [params.clientId]  - GA client id from the browser's _ga cookie; generated if absent
 * @param {string} [params.userAgent] - Guest's user agent, forwarded so GA can infer device/browser
 * @param {Array<{name: string, params?: object}>} params.events - GA4 events to send
 */
async function sendGa4Event({ clientId, userAgent, events }) {
    const measurementId = process.env.GA4_MEASUREMENT_ID
    const apiSecret = process.env.GA4_API_SECRET

    if (!measurementId || !apiSecret) {
        console.warn('[GA4 MP] GA4_MEASUREMENT_ID or GA4_API_SECRET is not set — skipping')
        return
    }

    if (!Array.isArray(events) || !events.length) {
        console.warn('[GA4 MP] No events to send — skipping')
        return
    }

    try {
        await axios.post(
            `${GA4_ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`,
            {
                client_id: clientId || generateClientId(),
                events,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    ...(userAgent ? { 'User-Agent': userAgent } : {}),
                },
                timeout: 10000,
            }
        )
        console.log(`[GA4 MP] Sent ${events.map((e) => e.name).join(', ')} for client_id=${clientId || '(generated)'}`)
    } catch (err) {
        console.error('[GA4 MP] Failed to send event:', err.response?.data || err.message)
    }
}

/**
 * Fires a `booking_created` event when a reservation is made (paid or not).
 */
async function trackBookingCreated({ clientId, userAgent, value, currency, room, quantity }) {
    return sendGa4Event({
        clientId,
        userAgent,
        events: [
            {
                name: 'booking_created',
                params: {
                    currency: currency || 'NGN',
                    value: value || 0,
                    items: buildItems(room, quantity),
                    engagement_time_msec: 1,
                },
            },
        ],
    })
}

/**
 * Fires the GA4 recommended `purchase` event when a payment is verified.
 */
async function trackPurchase({ clientId, userAgent, transactionId, value, currency, room, quantity }) {
    return sendGa4Event({
        clientId,
        userAgent,
        events: [
            {
                name: 'purchase',
                params: {
                    transaction_id: transactionId,
                    currency: currency || 'NGN',
                    value: value || 0,
                    items: buildItems(room, quantity),
                    engagement_time_msec: 1,
                },
            },
        ],
    })
}

module.exports = { sendGa4Event, trackBookingCreated, trackPurchase }
