const HotDeal = require("../models/hot-deal");

// The one authoritative lookup for "does this room currently have an active
// discount, and how much" — used both when displaying a room (so the guest
// sees the discounted price) and when verifying a payment (so the amount
// charged is checked against the same discount, not a client-supplied one).
// Sharing this avoids the two ever disagreeing about what the discount is.
const getActiveHotDeal = (roomId) =>
    HotDeal.findOne({
        roomId,
        $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: new Date() } }],
    }).select("discountPercent discountAmount endDate");

// A deal created from a flat amount charges that EXACT amount off, never a
// price re-derived from the rounded-up discountPercent — the guest must
// never be charged more than the admin intended. discountPercent alone is
// only ever a rounded display label in that case (deal badges, the admin
// list, email/receipt line text). Shared by reservation.js's actual charge
// computation and anywhere else that needs the real discounted price.
const computeDiscountedNightlyRate = (price, activeDeal) => {
    const basePrice = price ?? 0;
    const hasExactDiscountAmount = activeDeal?.discountAmount != null && activeDeal.discountAmount > 0;
    if (hasExactDiscountAmount) {
        return Math.max(0, Math.ceil(basePrice - activeDeal.discountAmount));
    }
    const discountPercent = activeDeal?.discountPercent ?? 0;
    return Math.ceil(basePrice * (1 - discountPercent / 100));
};

module.exports = { getActiveHotDeal, computeDiscountedNightlyRate };
