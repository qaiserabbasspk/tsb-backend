const { getActiveHotDeal, computeDiscountedNightlyRate } = require("./hotDeal_utility");

/**
 * The one server-side place nightly rate, hot-deal discount, and caution fee
 * turn into a chargeable total for a reservation. Shared by
 * reservation.js's create() and the OPay webhook's own finalize path so both
 * can never independently drift out of sync again — a previous divergence
 * here caused the webhook to reject legitimate discounted and/or
 * caution-fee payments (see OPAY_INTEGRATION_PLAN.md).
 */
async function computeReservationPricing(room, checkIn, checkOut, quantity) {
    const activeDeal = await getActiveHotDeal(room._id);
    const discountPercent = activeDeal?.discountPercent ?? 0;
    // discountPercent above is stored/displayed as a label only (emails,
    // receipts, the admin list) — the actual charge always goes through
    // computeDiscountedNightlyRate, which prefers an exact discountAmount
    // when the deal was created from one.
    const nightlyRate = computeDiscountedNightlyRate(room.price, activeDeal);
    const nights = Math.max(1, Math.round(
        (new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24)
    ));
    // Caution fee is refundable and never discounted — only the room rate
    // itself is subject to the hot-deal percentage.
    const cautionFee = room.hasRefundableCautionFee && room.refundableCautionFee
        ? room.refundableCautionFee * quantity : 0;
    const totalAmount = nightlyRate * nights * quantity + cautionFee;

    return { activeDeal, discountPercent, nightlyRate, nights, cautionFee, totalAmount };
}

module.exports = { computeReservationPricing };
