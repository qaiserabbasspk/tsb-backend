const { getRate } = require("../../utilities/currency_utility");
const { isSupportedCurrency, DEFAULT_CURRENCY } = require("../../utilities/supportedCurrencies_utility");
const Response = require("../../utilities/response_utility");

module.exports = {
    /**
     * Read-only display rate for showing converted prices before checkout
     * (property cards, room detail, booking summary). Never writes anything —
     * unlike /checkout-quote, which freezes a rate for one payment attempt,
     * this just reads the same lazily-refreshed cache. Falls back to USD when
     * an unsupported currency is requested rather than erroring, since a bad
     * display request shouldn't break price rendering.
     */
    rate: async (req, res) => {
        try {
            const source = String(req.query.source || "").trim().toUpperCase();
            let dest = String(req.query.dest || "").trim().toUpperCase();

            if (!source || !isSupportedCurrency(source)) {
                return Response.errorResponse(res, 400, "A supported source currency is required.");
            }
            if (!isSupportedCurrency(dest)) {
                dest = DEFAULT_CURRENCY;
            }

            const result = await getRate(source, dest);
            if (!result) {
                return Response.successResponse(res, 200, {
                    sourceCurrency: source,
                    destCurrency: dest,
                    rate: null,
                });
            }

            return Response.successResponse(res, 200, {
                sourceCurrency: source,
                destCurrency: dest,
                rate: result.rate,
                stale: result.stale,
            });
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },
};
