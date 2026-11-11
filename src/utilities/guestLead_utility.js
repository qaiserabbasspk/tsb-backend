const GuestLead = require("../models/guestLead");

const SOURCE_TYPES = ["lead_modal", "booking", "signup"];

/**
 * Upserts a guest's marketing record by email, appending the touchpoint to
 * `sources[]` rather than creating a duplicate. Callers use this fire-and-forget
 * (`.catch()`) so a failure here never affects the caller's own response.
 *
 * Dedupes by (type, refId) so re-running the same event (e.g. a backfill script
 * run twice) never creates a duplicate source entry.
 *
 * `capturedAt` defaults to now; pass an explicit Date when backfilling historical
 * records so firstSeenAt/lastSeenAt reflect real touchpoint timestamps.
 */
const upsertGuestLead = async ({ name, email, phone, source, refId, guestId, capturedAt }) => {
    if (!email || !SOURCE_TYPES.includes(source)) return null;

    const normalizedEmail = String(email).trim().toLowerCase();
    const touchedAt = capturedAt || new Date();
    const normalizedRefId = refId || null;
    const hasStructuredPhone = phone && typeof phone === "object" && phone.code;

    await GuestLead.findOneAndUpdate(
        { email: normalizedEmail },
        {
            $setOnInsert: {
                email: normalizedEmail,
                firstSeenAt: touchedAt,
            },
            $set: {
                lastSeenAt: touchedAt,
                ...(name ? { name } : {}),
                ...(hasStructuredPhone ? { phone } : {}),
                ...(guestId ? { guestId } : {}),
            },
        },
        { upsert: true, setDefaultsOnInsert: true }
    );

    const pushed = await GuestLead.findOneAndUpdate(
        {
            email: normalizedEmail,
            sources: { $not: { $elemMatch: { type: source, refId: normalizedRefId } } },
        },
        { $push: { sources: { type: source, refId: normalizedRefId, capturedAt: touchedAt } } },
        { new: true }
    );

    return pushed || GuestLead.findOne({ email: normalizedEmail });
};

module.exports = { upsertGuestLead };
