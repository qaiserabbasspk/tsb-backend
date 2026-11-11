const { getRate } = require("./currency_utility");

// Shared by rooms.js's guest-facing search (price filter/sort) and its
// price-bounds endpoint (slider floor/ceil) — both need to compare room
// prices across currencies rather than trusting the raw stored amount, and
// both reuse the same cached FX rates /fx/rate already reads from.

/**
 * Rounds a positive number UP to the nearest "nice" value — 1, 2, or 5 times
 * a power of ten (e.g. 837,412 -> 1,000,000; 42,300 -> 50,000; 13.4 -> 20).
 * Used so a currency-converted slider bound never shows an odd computed
 * number to the guest.
 */
function niceRoundUp(value) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const normalized = value / magnitude;
    let niceNormalized;
    if (normalized <= 1) niceNormalized = 1;
    else if (normalized <= 2) niceNormalized = 2;
    else if (normalized <= 5) niceNormalized = 5;
    else niceNormalized = 10;
    return niceNormalized * magnitude;
}

/**
 * { [currency]: rate-to-targetCurrency } for every distinct currency in the
 * list, reusing the same 6h-cached lookups /fx/rate itself reads from. A
 * currency whose rate can't be resolved maps to null — callers must treat
 * that as "can't place this room's price", never silently assume rate 1.
 */
async function buildCurrencyRateMap(currencies, targetCurrency) {
    const distinctCurrencies = [...new Set(currencies.filter(Boolean))];
    const map = {};
    await Promise.all(distinctCurrencies.map(async (currency) => {
        if (currency === targetCurrency) {
            map[currency] = 1;
            return;
        }
        const result = await getRate(currency, targetCurrency);
        map[currency] = result ? result.rate : null;
    }));
    return map;
}

/**
 * Annotates each room (a lean object with `price`/`currency`) with
 * `priceConverted` — its price in the rate map's target currency, or null
 * when that room's currency has no resolvable rate. Mutates and returns the
 * same array.
 */
function annotateConvertedPrice(rooms, rateMap) {
    for (const room of rooms) {
        const rate = rateMap[room.currency];
        room.priceConverted = typeof rate === "number" ? room.price * rate : null;
    }
    return rooms;
}

module.exports = { niceRoundUp, buildCurrencyRateMap, annotateConvertedPrice };
