// Every currency Flutterwave's /v3/transfers/rates endpoint actually quotes
// against NGN, verified by querying this app's own account (2026-07-29) via
// scripts/verifyFlutterwaveCurrencies.js - not assumed or copied from
// elsewhere. Re-run that script periodically; coverage can change and differs
// by merchant account/region.
const SUPPORTED_CURRENCIES = [
  "NGN",
  "USD","GBP","EUR","CAD","AUD","NZD","JPY","CNY","INR","BRL","MXN",
  "SEK","NOK","DKK","PLN","CZK","BGN","TRY","RUB","ILS","SAR",
  "AED","HKD","SGD","MYR","THB","PHP","VND",
  "GHS","KES","ZAR","UGX","TZS","RWF","ZMW","EGP","MAD","SLL","XAF",
  "XOF","ETB","MWK","BWP","GMD","GNF","BIF","MGA","MUR",
  "COP","ARS","CLP","PEN","VES","CRC",
];

// Ultimate fallback when a room's currency or a guest's chosen currency isn't
// in the list above, or no live/cached rate can be produced for the pair.
const DEFAULT_CURRENCY = "USD";

function isSupportedCurrency(code) {
  return SUPPORTED_CURRENCIES.includes(String(code || "").trim().toUpperCase());
}

module.exports = { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY, isSupportedCurrency };
