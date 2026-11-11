const BlockedDate = require("../models/blockedDates");
const Review = require("../models/review");
const { getActiveHotDeal } = require("./hotDeal_utility");
const { getLocalizedRoomFields, ensureRoomTranslation, SOURCE_LOCALE } = require("./roomTranslation_utility");
const { isSupportedLocale } = require("./supportedLocales_utility");

// Builds the "rich" single-room detail payload — blocked dates, real review
// aggregate, active hot deal, locale-aware translation — on top of a room's
// own fields. Extracted from rooms.js's getById so the property-detail
// endpoint (which only needs this for whichever one room is currently
// selected, not every room in a property) can reuse the exact same logic
// instead of a second copy drifting out of sync.
const buildRoomDetailPayload = async (room, req) => {
    // Surfaced so the guest-facing date picker can grey out fully-blocked
    // dates up front — no host-entered reason exposed, just the range and
    // what's left.
    const blockedDocs = await BlockedDate.find({
        roomId: room.id,
        endDate: { $gte: new Date() },
    }).select("startDate endDate quantity");
    const blockedRanges = blockedDocs.map((b) => ({
        startDate: b.startDate,
        endDate: b.endDate,
        remainingUnits: Math.max(0, (room.quantity || 1) - (b.quantity || 1)),
    }));

    // Real average rating + count from actual reviews — used for the
    // detail page's aggregateRating structured data. Only meaningful (and
    // only shown by the frontend) when reviewCount > 0; Google disallows
    // self-declared ratings with no backing review data.
    const [ratingAgg] = await Review.aggregate([
        { $match: { roomId: room._id } },
        { $group: { _id: null, avgRating: { $avg: "$rating" }, reviewCount: { $sum: 1 } } },
    ]);
    const avgRating = ratingAgg ? Math.round(ratingAgg.avgRating * 10) / 10 : null;
    const reviewCount = ratingAgg ? ratingAgg.reviewCount : 0;

    // Surfaced so the guest UI can show/charge the discounted price without
    // a second round trip — reservation creation independently re-derives
    // this same discount server-side rather than trusting it.
    const activeDeal = await getActiveHotDeal(room.id);

    // Locale-aware content: falls back to the source English fields
    // whenever a translation is missing, stale, or Google Translate isn't
    // configured yet - never a blank field or a raw key.
    const requestedLocale = String(req.query.locale || "").trim().toLowerCase();
    const locale = isSupportedLocale(requestedLocale) ? requestedLocale : SOURCE_LOCALE;
    const localizedFields = await getLocalizedRoomFields(room, locale);

    if (locale !== SOURCE_LOCALE) {
        // Fire-and-forget: refresh/populate the translation for next time
        // without making this guest wait on a live Google Translate call.
        ensureRoomTranslation(room, locale).catch((err) =>
            console.error("[RoomTranslation] Unexpected error:", err)
        );
    }

    return {
        ...room.toObject(),
        ...localizedFields,
        locale,
        blockedRanges,
        avgRating,
        reviewCount,
        discountPercent: activeDeal?.discountPercent ?? 0,
        // Exact amount when the deal was created from a flat amount — the
        // frontend's computeBookingPricing prefers this over discountPercent
        // so the price shown/charged here matches what reservation.js
        // independently re-derives and verifies. Null (not 0) for a
        // percentage-only deal, so the frontend can tell "no exact amount"
        // apart from "a real amount of zero".
        discountAmount: activeDeal?.discountAmount ?? null,
        dealEndDate: activeDeal?.endDate ?? null,
    };
};

module.exports = { buildRoomDetailPayload };
