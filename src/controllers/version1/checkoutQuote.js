const Room = require("../../models/rooms");
const CheckoutQuote = require("../../models/checkoutQuote");
const { checkoutQuoteValidation } = require("../../validations/checkoutQuote");
const { getRate } = require("../../utilities/currency_utility");
const { isSupportedCurrency, DEFAULT_CURRENCY } = require("../../utilities/supportedCurrencies_utility");

const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");

const QUOTE_TTL_MS = 15 * 60 * 1000;

module.exports = {
    /**
     * Freezes the exchange rate for one checkout attempt (keyed by txRef) so
     * that reservation.js can later verify the Flutterwave charge against a
     * rate that cannot have moved since checkout was initiated. Deliberately
     * does NOT compute or store a converted price total here — nights,
     * quantity, hot-deal discount and caution fee are already correctly
     * recomputed server-side in reservation.js's create handler at booking
     * time, and duplicating that math here would risk the two calculations
     * silently drifting apart. Only the rate itself needs to be frozen.
     */
    quote: async (req, res) => {
        try {
            const { error, value } = checkoutQuoteValidation(req.body);
            if (error) {
                return Response.errorResponse(res, 400, error.details?.[0]?.message || error.message);
            }

            const { roomId, txRef, guestCurrency: requestedGuestCurrency } = value;

            const room = await Room.findById(roomId).select("currency");
            if (!room) {
                return Response.errorResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            const sourceCurrency = (room.currency || "NGN").trim().toUpperCase();

            // Fall back to USD if the guest's chosen currency isn't one Flutterwave
            // actually quotes for this account — never reject the checkout outright
            // over an unsupported currency choice.
            let guestCurrency = isSupportedCurrency(requestedGuestCurrency)
                ? requestedGuestCurrency
                : DEFAULT_CURRENCY;

            let rateResult = await getRate(sourceCurrency, guestCurrency);
            if (!rateResult && guestCurrency !== DEFAULT_CURRENCY) {
                guestCurrency = DEFAULT_CURRENCY;
                rateResult = await getRate(sourceCurrency, guestCurrency);
            }

            if (!rateResult) {
                return Response.errorResponse(
                    res,
                    503,
                    "Currency conversion is temporarily unavailable — please try again shortly."
                );
            }

            const now = new Date();

            // Upsert on txRef: a guest switching currency before paying re-quotes
            // the same checkout attempt rather than colliding on the unique index.
            const quote = await CheckoutQuote.findOneAndUpdate(
                { txRef },
                {
                    roomId: room._id,
                    sourceCurrency,
                    guestCurrency,
                    rate: rateResult.rate,
                    createdOn: now,
                    expiresAt: new Date(now.getTime() + QUOTE_TTL_MS),
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            return Response.successResponse(res, 200, {
                success: true,
                sourceCurrency,
                guestCurrency,
                rate: quote.rate,
                expiresAt: quote.expiresAt,
                usedFallbackCurrency: guestCurrency !== requestedGuestCurrency,
            });
        } catch (err) {
            console.error("[CheckoutQuote] failed:", err.message);
            return Response.errorResponse(res, 500, "Could not generate a checkout quote — please try again.");
        }
    },
};
