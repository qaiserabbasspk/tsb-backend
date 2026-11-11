const geoip = require("geoip-lite");
const { resolveClientIp } = require("../middlewares/rateLimiter");

/**
 * Resolves a 2-letter ISO country code for the request. Prefers Cloudflare's
 * `cf-ipcountry` header (set directly, no lookup needed) for when this domain
 * is eventually proxied through Cloudflare; falls back to a local, offline
 * geoip-lite lookup against the resolved client IP today, since there is no
 * CDN/edge country header available yet (see middlewares/rateLimiter.js).
 * Returns null when no country can be determined - callers should default to
 * English / USD in that case, never guess.
 */
function resolveCountry(req) {
  const cfCountry = req.headers["cf-ipcountry"];
  if (typeof cfCountry === "string" && cfCountry.trim() && cfCountry.trim().toUpperCase() !== "XX") {
    return cfCountry.trim().toUpperCase();
  }

  const ip = resolveClientIp(req);
  if (!ip) return null;

  const lookup = geoip.lookup(ip);
  return lookup?.country || null;
}

module.exports = { resolveCountry };
