const { verify } = require("jsonwebtoken");

// Shared visibility rules for Room documents — extracted so both the
// per-room detail endpoint (controllers/version1/rooms.js) and the
// property-detail endpoint (controllers/version1/roomProperty.js) apply
// the exact same "who can see an unapproved listing" logic instead of two
// copies drifting apart.

// Rooms saved before reviewStatus existed have no persisted value for it —
// Mongoose only applies the schema default on hydration, not in raw query
// filters — so "approved" must also match documents missing the field.
//
// Also excludes soft-deleted rooms (isDeleted:true) — every call site of
// this helper is already a "should this room be visible to guests/at all"
// check, so a deleted room must never leak through here, in one shared
// place rather than patched into each of this filter's many call sites.
const approvedVisibilityFilter = () => ({
    $and: [
        { $or: [{ reviewStatus: "approved" }, { reviewStatus: { $exists: false } }] },
        { isDeleted: { $ne: true } },
    ],
});

// Every login (admin, host, guest) sets req.user via the same optional-bearer
// middleware, so "req.user is truthy" is NOT a safe stand-in for "allowed to
// see unapproved listings" — a logged-in guest is still just a guest. Only
// staff, or the host who owns this specific listing, have a reason to.
const isAdminUser = (user) => typeof user?.code === "string" && user.code.startsWith("AD");
const isHostUser = (user) => typeof user?.code === "string" && user.code.startsWith("HO");
const canViewUnapproved = (user, ownerHostId) =>
    isAdminUser(user) ||
    (isHostUser(user) && !!ownerHostId && user.id === ownerHostId.toString());

// Short-lived, room-scoped token minted by rooms.js's previewLink (behind
// the admin/host "preview" action) — needed because that preview opens the
// public guest site in a new tab/origin, where the admin portal's own
// session token isn't available.
const hasValidPreviewToken = (token, roomId) => {
    if (!token) return false;
    try {
        const decoded = verify(token, process.env.JWK_SECRET);
        return decoded?.type === "roomPreview" && decoded.roomId === roomId.toString();
    } catch (_) {
        return false;
    }
};

module.exports = {
    approvedVisibilityFilter,
    isAdminUser,
    isHostUser,
    canViewUnapproved,
    hasValidPreviewToken,
};
