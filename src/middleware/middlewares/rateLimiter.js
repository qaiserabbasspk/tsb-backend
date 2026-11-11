const rateLimit = require('express-rate-limit')
const { ipKeyGenerator } = require('express-rate-limit')

// IIS (ARR) forwards the client as "ip:port" in X-Forwarded-For, e.g. 41.155.71.226:49989.
// Strip the IPv4 port, then run through ipKeyGenerator so IPv6 addresses are
// normalized — express-rate-limit v8 throws ERR_ERL_KEY_GEN_IPV6 at startup if a
// custom keyGenerator uses the IP without this helper.
//
// Once Cloudflare proxies this domain, IIS's REMOTE_ADDR becomes Cloudflare's edge
// IP for every visitor, which would collapse everyone into one rate-limit bucket.
// Cloudflare sets `CF-Connecting-IP` to the real visitor IP regardless of how many
// hops sit behind it, so prefer that when present. It's absent today (no Cloudflare
// in front yet), so this falls through to the existing req.ip logic until cutover —
// safe to deploy before or after the DNS change.
// Resolves the real visitor IP as a plain string (not yet run through
// ipKeyGenerator, which is specifically for rate-limit bucket keys) - reused
// by utilities/geo_utility.js for IP-based country lookups, so both places
// share one understanding of "what is the client's real IP behind IIS/ARR."
const resolveClientIp = (req) => {
  const cfConnectingIp = req.headers['cf-connecting-ip']
  if (typeof cfConnectingIp === 'string' && cfConnectingIp.trim()) {
    return cfConnectingIp.trim()
  }
  const raw = req.ip || ''
  const ipv4WithPort = raw.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)
  return ipv4WithPort ? ipv4WithPort[1] : raw
}

const clientIp = (req) => ipKeyGenerator(resolveClientIp(req))

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIp,
  message: { success: false, message: 'Too many requests, please try again later.' },
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIp,
  message: { success: false, message: 'Too many attempts, please try again later.' },
})

// AI Concierge calls a paid OpenAI model, so this stays tighter than the
// general API limiter to cap worst-case cost from a single abusive client —
// but 20 tries per 15 minutes is generous enough for a guest to genuinely
// experiment with a few moods/prompts while planning a trip.
const aiConciergeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIp,
  message: {
    success: false,
    message:
      "You've reached the AI Trip Concierge's request limit for now. Take a moment to review your matches, or browse All Stays — the Concierge will be ready for more ideas again shortly.",
  },
})

// A guest could otherwise hammer this endpoint hoping to land a stale,
// favorable rate right before it expires — keep it tighter than the general
// API limiter, but loose enough for a guest genuinely re-quoting a few times
// while comparing currencies before paying.
const checkoutQuoteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIp,
  message: { success: false, message: 'Too many quote requests — please wait a few minutes and try again.' },
})

module.exports = { globalLimiter, authLimiter, aiConciergeLimiter, checkoutQuoteLimiter, resolveClientIp }
