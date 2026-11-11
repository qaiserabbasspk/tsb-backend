const axios = require('axios')

const X_PIXEL_ID = 'qrthl'

/**
 * Sends a server-side conversion event to the X (Twitter) Conversion API.
 * Fire-and-forget: callers should not await this in the request path that
 * responds to the guest — log and swallow errors instead, same as other
 * third-party calls in this codebase (Flutterwave verify, emailer, etc).
 *
 * Requires X_PURCHASE_EVENT_ID (format "tw-qrthl-xxxxx") from X Ads Manager —
 * skips and logs a warning until that env var is set.
 *
 * @param {object} params
 * @param {string} params.conversionId   - Our own reference (e.g. txRef) for de-dup
 * @param {string} [params.twclid]       - X click id captured from the landing URL
 * @param {string} [params.ipAddress]    - Guest's IP at reservation creation time
 * @param {string} [params.userAgent]    - Guest's user agent at reservation creation time
 * @param {string} [params.eventSourceUrl] - Page URL where the conversion happened
 */
async function sendConversionEvent({ conversionId, twclid, ipAddress, userAgent, eventSourceUrl }) {
    const token = process.env.X_PIXEL_TOKEN
    const eventId = process.env.X_PURCHASE_EVENT_ID

    if (!token) {
        console.warn('[X Conversion API] X_PIXEL_TOKEN is not set — skipping')
        return
    }

    if (!eventId) {
        console.warn('[X Conversion API] X_PURCHASE_EVENT_ID is not set — skipping (waiting on event ID from X Ads Manager)')
        return
    }

    const identifiers = {}
    if (twclid) identifiers.twclid = twclid
    if (ipAddress) identifiers.ip_address = ipAddress
    if (userAgent) identifiers.user_agent = userAgent

    if (!Object.keys(identifiers).length) {
        console.warn('[X Conversion API] No identifiers available — skipping for conversionId:', conversionId)
        return
    }

    try {
        await axios.post(
            `https://ads-api.x.com/12/measurement/conversions/${X_PIXEL_ID}`,
            {
                conversions: [
                    {
                        conversion_time: new Date().toISOString(),
                        event_id: eventId,
                        conversion_id: conversionId,
                        ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {}),
                        identifiers: [identifiers],
                    },
                ],
            },
            {
                headers: {
                    'X-Pixel-Token': token,
                    'Content-Type': 'application/json',
                },
                timeout: 10000,
            }
        )
        console.log(`[X Conversion API] Sent conversion for conversionId=${conversionId}`)
    } catch (err) {
        console.error('[X Conversion API] Failed to send conversion event:', err.response?.data || err.message)
    }
}

module.exports = { sendConversionEvent }
