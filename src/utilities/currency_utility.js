const axios = require("axios");
const ExchangeRate = require("../models/exchangeRate");

// Refresh each currency pair at most every 6 hours, matching how often
// Flutterwave updates its own rates. Refetch is lazy: the first request after
// expiry pulls a fresh rate, everyone else is served the cached value.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** True when a real Flutterwave secret key is configured (not empty/placeholder). */
function isFlutterwaveConfigured() {
  const key = process.env.FLW_SECRET_KEY?.trim();
  return !!key && key !== "your-flutterwave-secret-key";
}

/**
 * Raw source->dest rate from Flutterwave's transfer-rates endpoint. Confirmed
 * (2026-07-29, live test against this app's own keys) to support direct
 * arbitrary currency pairs, not just NGN-anchored ones - e.g. EUR->CAD,
 * GBP->GHS, USD->KES, MWK->NGN all returned valid rates.
 */
async function fetchFlutterwaveRate(sourceCurrency, destCurrency) {
  const key = process.env.FLW_SECRET_KEY?.trim();
  if (!isFlutterwaveConfigured()) return null;

  try {
    // Request amount=1 so the returned `rate` is the per-unit conversion rate.
    const res = await axios.get("https://api.flutterwave.com/v3/transfers/rates", {
      params: { amount: 1, destination_currency: destCurrency, source_currency: sourceCurrency },
      headers: { Authorization: `Bearer ${key}` },
      timeout: 10000,
    });

    const body = res.data;
    if (body.status !== "success") return null;

    const rate = Number(body.data?.rate);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

async function getCachedRate(sourceCurrency, destCurrency) {
  const cached = await ExchangeRate.findOne({ sourceCurrency, destCurrency });
  if (!cached) return null;

  const age = Date.now() - cached.fetchedAt.getTime();
  return { rate: Number(cached.rate), fetchedAt: cached.fetchedAt, stale: age >= CACHE_TTL_MS };
}

async function fetchAndCacheRate(sourceCurrency, destCurrency) {
  const markupPercent = parseFloat(process.env.EXCHANGE_RATE_MARKUP_PERCENT ?? "0");

  const rawRate = await fetchFlutterwaveRate(sourceCurrency, destCurrency);
  if (rawRate == null) return null;

  const effectiveRate = rawRate * (1 + markupPercent / 100);
  const fetchedAt = new Date();

  const cached = await ExchangeRate.findOneAndUpdate(
    { sourceCurrency, destCurrency },
    { rate: effectiveRate, markupPercent, fetchedAt },
    { upsert: true, new: true }
  );

  return { rate: Number(cached.rate), fetchedAt: cached.fetchedAt, stale: false };
}

/**
 * Resolves a source->dest conversion rate: identity for a same-currency pair,
 * otherwise fresh cache -> live fetch -> stale cache as a last resort.
 * Returns null (never a fabricated rate) when no data is available at all -
 * callers must decide their own fallback policy (e.g. offering USD instead of
 * the guest's chosen currency) rather than this module silently guessing.
 */
async function getRate(sourceCurrency, destCurrency) {
  if (sourceCurrency === destCurrency) {
    return { rate: 1, fetchedAt: new Date(), stale: false };
  }

  const cached = await getCachedRate(sourceCurrency, destCurrency);
  if (cached && !cached.stale) return cached;

  const fresh = await fetchAndCacheRate(sourceCurrency, destCurrency);
  if (fresh) return fresh;

  // Live fetch failed (network issue, currency unsupported, etc.) - serve a
  // stale cached rate rather than failing outright, if one exists.
  if (cached) return cached;

  return null;
}

// Conservative sanity helper: some currencies (very low-value units) should
// never be worth close to $1 - such a value is almost certainly incorrect
// (provider misquote, sandbox/test data, unit mismatch). Rather than
// comparing the actual cross-rate against a single flat threshold - which
// breaks down once the destination is itself a "weak" unit currency (e.g.
// JPY, where even a genuinely tiny-value source currency crosses an
// arbitrary cutoff), or once the source is a currency like GHS/ZMW that's
// legitimately worth several cents - we look up the currency's own rate
// against one fixed reference currency (USD). That gives a single,
// currency-intrinsic answer regardless of what the guest actually converts
// to. USD is never shown to guests here; it's purely an internal anchor for
// this check (the actual displayed rate is still the direct source->dest
// rate from `_getRate` above, unchanged).
const CENTRAL_CURRENCY = "USD";
const LOW_VALUE_TO_CENTRAL_CEILING = 0.15; // USD per unit - real-world max among these currencies is ~$0.07 (GHS)

function isLikelyLowValueCurrency(code) {
  const low = new Set(["NGN", "GHS", "KES", "UGX", "TZS", "MWK", "ZMW", "RWF", "MUR", "BWP", "MGA", "SLL", "XOF", "XAF"]);
  return low.has(code);
}

// Wrap getRate with a plausibility check before exposing to callers.
const _getRate = getRate;
async function getRateWithSanity(sourceCurrency, destCurrency) {
  const result = await _getRate(sourceCurrency, destCurrency);
  if (!result) return null;

  if (sourceCurrency !== destCurrency && isLikelyLowValueCurrency(sourceCurrency) && sourceCurrency !== CENTRAL_CURRENCY) {
    const toCentral = await _getRate(sourceCurrency, CENTRAL_CURRENCY);
    if (!toCentral || toCentral.rate >= LOW_VALUE_TO_CENTRAL_CEILING) return null;
  }

  return result;
}

/** Converts an amount from sourceCurrency to destCurrency, or null if no rate is available. */
async function convertAmount(amount, sourceCurrency, destCurrency) {
  const result = await getRateWithSanity(sourceCurrency, destCurrency);
  if (!result) return null;
  return Math.ceil(amount * result.rate);
}

module.exports = {
  isFlutterwaveConfigured,
  // Expose the sanitized getRate to call-sites.
  getRate: getRateWithSanity,
  convertAmount,
  CACHE_TTL_MS,
  // Expose lower-level helpers for maintenance scripts (refresh, audit).
  fetchAndCacheRate,
  getCachedRate,
};
