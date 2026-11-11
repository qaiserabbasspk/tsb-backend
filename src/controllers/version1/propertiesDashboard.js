const RoomProperty = require("../../models/roomProperty");
const Room = require("../../models/rooms");
const Host = require("../../models/hosts");
const Category = require("../../models/category");
const Reservation = require("../../models/reservation");

const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/qbActivityLog_utility");
const { isAdminUser } = require("../../utilities/roomVisibility_utility");
const { deleteOneRoom } = require("./rooms");

// Admin-only reporting endpoints behind the "Properties" dashboard page.
// Reads RoomProperty (the real property model — see models/roomProperty.js)
// joined with Room for anything status/photo/description related, since
// RoomProperty deliberately holds none of that itself (PROPERTY_ROOM_
// RESTRUCTURE_DECISIONS.md Phase 3: those live per-room, not per-property).
// Never touches controllers/version1/properties.js — that's the legacy,
// unused Rentrack real-estate Property model.

// Kept in sync by hand with scripts/auditDuplicateProperties.js — that
// script is the source of truth for this matching logic (iterated against
// real production duplicate clusters), this is just its live-endpoint
// mirror. Tightened from the original 0.3km/name-substring-only version
// (2026-08-18) after it was surfacing false positives in the admin UI: a
// generic name fragment ("Apartment") or a shared host/city name matching
// everything, and same-brand properties on genuinely different streets
// (e.g. BRIZON APARTMENTS, 3 streets 53-159m apart) being flagged as
// duplicates purely on proximity.
const DUPLICATE_RADIUS_KM = 0.03;
const GROWTH_WEEKS = 12;
const TOP_LIST_LIMIT = 10;
const ADDRESS_WRAPPER_CHAR_LIMIT = 20;
const MIN_DISTINCTIVE_SUBSTRING_LENGTH = 4;

const toRad = (deg) => (deg * Math.PI) / 180;

const haversineKm = (a, b) => {
    const R = 6371;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(h));
};

const normalize = (s) => (s || "").trim().toLowerCase();

// Words too generic to tell one property apart from another on name alone
// (e.g. a lone "Apartment" would otherwise substring-match every listing).
const GENERIC_NAME_WORDS = new Set([
    "apartment", "apartments", "hotel", "hotels", "suite", "suites",
    "resort", "resorts", "villa", "villas", "residence", "residences",
    "guesthouse", "guest", "house", "homes", "home", "lodge", "inn",
    "place", "court", "courts", "shortlet", "limited", "ltd", "the", "and",
]);
const distinctiveName = (name, entity) => {
    const city = normalize(entity?.address?.city);
    const tokens = (normalize(name).match(/[a-z0-9]+/g) || []).filter(
        (t) => !GENERIC_NAME_WORDS.has(t) && !(city && city.includes(t))
    );
    return tokens.join(" ");
};

// Words too generic to tell one street apart from another — same idea as
// GENERIC_NAME_WORDS, applied to addresses. Covers street-type words plus
// country/state names baked into the street field itself.
const ADDRESS_STOPWORDS = new Set([
    "close", "street", "st", "road", "rd", "avenue", "ave", "crescent",
    "way", "wy", "drive", "dr", "lane", "ln", "boulevard", "blvd", "off",
    "by", "opp", "opposite", "near", "nigeria", "lagos", "abuja", "state",
    "federal", "capital", "territory", "island", "ghana",
]);
const addressTokensFor = (entity) => {
    const city = normalize(entity.address?.city);
    const country = normalize(entity.address?.country);
    const rawTokens = (normalize(entity.address?.street).match(/[a-z0-9+]+/g) || []);
    return rawTokens.filter((t) => {
        if (ADDRESS_STOPWORDS.has(t)) return false;
        if (/^\d{5,}$/.test(t)) return false; // postal code
        if (city && city.includes(t)) return false;
        if (country && country.includes(t)) return false;
        return true;
    });
};

// True if the property's street has any real, specific content left after
// stripping filler/city/state/country — false for a bare "Accra, Ghana" or
// "Lagos 106104, Lagos, Nigeria" with nothing distinguishing about it.
const hasMeaningfulAddressContent = (entity) => addressTokensFor(entity).length > 0;

// Same matching predicate as roomProperties.js's checkConflict, widened here
// to compare every property against every other rather than only across
// different hosts — this is a periodic audit pass over the whole catalog,
// not the real-time single-property nudge. A name match alone is never
// enough: categoryId must also agree (a Hotel and an Event Centre at the
// same address are different bookable products), and an address must
// either textually confirm the match or, when both sides have real street
// content that just doesn't line up, the pair is vetoed outright — no
// falling back to "close enough" proximity for two obviously different
// streets.
const looksLikeDuplicate = (a, b) => {
    const nameA = normalize(a.name);
    const nameB = normalize(b.name);
    if (!nameA || !nameB) return false;

    const distinctA = distinctiveName(a.name, a);
    const distinctB = distinctiveName(b.name, b);
    let nameMatches;
    if (distinctA && distinctB) {
        if (distinctA === distinctB) {
            nameMatches = true;
        } else if (distinctA.length < MIN_DISTINCTIVE_SUBSTRING_LENGTH || distinctB.length < MIN_DISTINCTIVE_SUBSTRING_LENGTH) {
            nameMatches = false;
        } else {
            nameMatches = distinctA.includes(distinctB) || distinctB.includes(distinctA);
        }
    } else {
        nameMatches = nameA === nameB;
    }
    if (!nameMatches) return false;

    if (!a.categoryId || !b.categoryId || String(a.categoryId) !== String(b.categoryId)) return false;

    const streetA = normalize(a.address?.street);
    const streetB = normalize(b.address?.street);
    let addressTextMatches = false;
    if (streetA && streetB) {
        if (streetA === streetB) {
            addressTextMatches = true;
        } else {
            const [shorter, longer] = streetA.length <= streetB.length ? [streetA, streetB] : [streetB, streetA];
            const idx = longer.indexOf(shorter);
            addressTextMatches = idx !== -1 && (longer.length - shorter.length) <= ADDRESS_WRAPPER_CHAR_LIMIT;
        }
    }
    if (addressTextMatches) return true;

    if (streetA && streetB && hasMeaningfulAddressContent(a) && hasMeaningfulAddressContent(b)) {
        return false;
    }

    const cityA = normalize(a.address?.city);
    const cityB = normalize(b.address?.city);
    return (
        !!cityA &&
        cityA === cityB &&
        typeof a.location?.latitude === "number" && typeof a.location?.longitude === "number" &&
        typeof b.location?.latitude === "number" && typeof b.location?.longitude === "number" &&
        haversineKm(a.location, b.location) <= DUPLICATE_RADIUS_KM
    );
};

// p.id (not p._id) is read here because this runs against a
// .lean({ virtuals: true }) result — but that option does not actually
// compute the schema's "id" virtual in this Mongoose setup (verified
// directly: p.id comes back undefined while p._id is present), so _id is
// used explicitly instead. Bit us once already in the compare endpoint;
// this is the same bug in the duplicates list that fed it.
const summarizeForDuplicate = (p) => ({
    id: p._id.toString(),
    name: p.name,
    address: p.address,
    hostName: p.host?.name || null,
    hostCode: p.host?.code || null,
});

module.exports = {
    // GET /properties-dashboard/summary
    summary: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const now = new Date();
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - 7);
            const startOfMonth = new Date(now);
            startOfMonth.setDate(now.getDate() - 30);

            const [
                totalProperties,
                newThisWeek,
                newThisMonth,
                totalRooms,
                activeRooms,
                inactiveRooms,
                approvedRooms,
                pendingRooms,
                rejectedRooms,
                hostIdsWithProperty,
            ] = await Promise.all([
                RoomProperty.countDocuments({}),
                RoomProperty.countDocuments({ createdOn: { $gte: startOfWeek } }),
                RoomProperty.countDocuments({ createdOn: { $gte: startOfMonth } }),
                // isDeleted excluded from every room count below — a soft-deleted
                // room is gone from the host's perspective and shouldn't inflate
                // the catalog totals an admin sees here.
                Room.countDocuments({ isDeleted: { $ne: true } }),
                Room.countDocuments({ status: 1, isDeleted: { $ne: true } }),
                Room.countDocuments({ status: 0, isDeleted: { $ne: true } }),
                Room.countDocuments({ reviewStatus: "approved", isDeleted: { $ne: true } }),
                Room.countDocuments({ reviewStatus: "pending", isDeleted: { $ne: true } }),
                Room.countDocuments({ reviewStatus: "rejected", isDeleted: { $ne: true } }),
                RoomProperty.distinct("hostId"),
            ]);

            return Response.successResponse(res, res.statusCode, {
                totalProperties,
                newThisWeek,
                newThisMonth,
                totalRooms,
                roomStatus: { active: activeRooms, inactive: inactiveRooms },
                roomReviewStatus: { approved: approvedRooms, pending: pendingRooms, rejected: rejectedRooms },
                totalHostsWithProperty: hostIdsWithProperty.length,
            });
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // GET /properties-dashboard/by-category
    byCategory: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const counts = await RoomProperty.aggregate([
                { $group: { _id: "$categoryId", count: { $sum: 1 } } },
            ]);
            const categories = await Category.find({}, { name: 1 }).lean();
            const nameById = new Map(categories.map((c) => [c._id.toString(), c.name]));

            const result = counts
                .map((c) => ({
                    categoryId: c._id ? c._id.toString() : null,
                    name: c._id ? (nameById.get(c._id.toString()) || "Unknown") : "Uncategorized",
                    count: c.count,
                }))
                .sort((a, b) => b.count - a.count);

            return Response.successResponse(res, res.statusCode, result);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // GET /properties-dashboard/growth — properties created per week, over a
    // rolling GROWTH_WEEKS-week window, oldest week first (chart-ready order).
    growth: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const now = new Date();
            const start = new Date(now);
            start.setDate(now.getDate() - GROWTH_WEEKS * 7);

            const properties = await RoomProperty.find(
                { createdOn: { $gte: start } },
                { createdOn: 1 }
            ).lean();

            const buckets = Array.from({ length: GROWTH_WEEKS }, (_, i) => {
                const weekStart = new Date(start);
                weekStart.setDate(start.getDate() + i * 7);
                return { weekStart, count: 0 };
            });

            properties.forEach((p) => {
                if (!p.createdOn) return;
                const diffDays = Math.floor((new Date(p.createdOn) - start) / (1000 * 60 * 60 * 24));
                const idx = Math.min(GROWTH_WEEKS - 1, Math.max(0, Math.floor(diffDays / 7)));
                buckets[idx].count += 1;
            });

            return Response.successResponse(
                res,
                res.statusCode,
                buckets.map((b) => ({ weekStart: b.weekStart, count: b.count }))
            );
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // GET /properties-dashboard/newest?page=&pageSize= — latest-first,
    // paginated, for the dashboard's properties table.
    newest: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const total = await RoomProperty.countDocuments({});
            const { pagination, skip } = await PaginationUtility.paginationParams(req, total);

            const properties = total === 0
                ? []
                : await RoomProperty.find({})
                    .populate("host", "name code")
                    .populate("rooms", "_id")
                    .sort({ createdOn: -1 })
                    .skip(skip)
                    .limit(pagination.pageSize)
                    .lean({ virtuals: true });

            pagination.data = properties.map((p) => ({
                id: p._id.toString(),
                name: p.name,
                address: p.address,
                categoryId: p.categoryId,
                hostName: p.host?.name || null,
                roomCount: p.rooms?.length ?? 0,
                createdOn: p.createdOn,
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // GET /properties-dashboard/export — every property (not just the
    // dashboard's "newest" preview), enriched with host contact details and
    // room-price stats, for the admin's Properties-page CSV export (ops/
    // marketing use: host outreach, portfolio sizing, price positioning).
    // Same pagination shape as `newest` — the frontend just requests a
    // page large enough to cover the whole collection in one call, same as
    // the Rooms page's own CSV export already does.
    export: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const total = await RoomProperty.countDocuments({});
            const { pagination, skip } = await PaginationUtility.paginationParams(req, total);

            const properties = total === 0
                ? []
                : await RoomProperty.find({})
                    .populate("host", "name code email phone address")
                    .populate("categoryId", "name")
                    .populate("rooms", "price currency status")
                    .sort({ createdOn: -1 })
                    .skip(skip)
                    .limit(pagination.pageSize)
                    .lean({ virtuals: true });

            pagination.data = properties.map((p) => {
                const rooms = p.rooms ?? [];
                const prices = rooms.map((r) => r.price).filter((price) => typeof price === "number");
                return {
                    id: p._id.toString(),
                    name: p.name,
                    address: p.address,
                    categoryName: p.categoryId?.name || null,
                    host: p.host
                        ? {
                            id: p.host._id?.toString(),
                            name: p.host.name,
                            code: p.host.code,
                            email: p.host.email,
                            phone: p.host.phone,
                            address: p.host.address,
                        }
                        : null,
                    totalRooms: rooms.length,
                    activeRooms: rooms.filter((r) => r.status === 1).length,
                    minPrice: prices.length ? Math.min(...prices) : null,
                    maxPrice: prices.length ? Math.max(...prices) : null,
                    currency: rooms.find((r) => r.currency)?.currency || null,
                    createdOn: p.createdOn,
                };
            });

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // GET /properties-dashboard/zero-room — properties with no rooms attached
    // at all (the same signal as the Aug-16 one-off integrity check, now
    // surfaced live instead of run as a manual script).
    zeroRoom: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const properties = await RoomProperty.find({})
                .populate("rooms", "_id")
                .lean({ virtuals: true });

            const result = properties
                .filter((p) => !p.rooms || p.rooms.length === 0)
                .map((p) => ({ id: p._id.toString(), name: p.name, address: p.address, createdOn: p.createdOn }));

            return Response.successResponse(res, res.statusCode, result);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // GET /properties-dashboard/incomplete — properties that DO have rooms,
    // but where every one of those rooms lacks both photos and a
    // description. Zero-room properties are excluded here since they're
    // already covered by the zero-room list above.
    incomplete: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const properties = await RoomProperty.find({})
                .populate("rooms", "gallery description")
                .lean({ virtuals: true });

            const result = properties
                .filter((p) => {
                    if (!p.rooms || p.rooms.length === 0) return false;
                    return p.rooms.every((r) => (!r.gallery || r.gallery.length === 0) && !r.description?.trim());
                })
                .map((p) => ({ id: p._id.toString(), name: p.name, address: p.address, roomCount: p.rooms.length }));

            return Response.successResponse(res, res.statusCode, result);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // GET /properties-dashboard/geo — top countries/cities by property count.
    geo: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const [byCountry, byCity] = await Promise.all([
                RoomProperty.aggregate([
                    { $match: { "address.country": { $nin: [null, ""] } } },
                    { $group: { _id: "$address.country", count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: TOP_LIST_LIMIT },
                ]),
                RoomProperty.aggregate([
                    { $match: { "address.city": { $nin: [null, ""] } } },
                    { $group: { _id: { city: "$address.city", country: "$address.country" }, count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: TOP_LIST_LIMIT },
                ]),
            ]);

            return Response.successResponse(res, res.statusCode, {
                topCountries: byCountry.map((c) => ({ country: c._id, count: c.count })),
                topCities: byCity.map((c) => ({ city: c._id.city, country: c._id.country, count: c.count })),
            });
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // GET /properties-dashboard/top-hosts — hosts ranked by property count.
    topHosts: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const counts = await RoomProperty.aggregate([
                { $match: { hostId: { $ne: null } } },
                { $group: { _id: "$hostId", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: TOP_LIST_LIMIT },
            ]);
            const hostIds = counts.map((c) => c._id);
            const hosts = await Host.find({ _id: { $in: hostIds } }, { name: 1, code: 1 }).lean();
            const hostById = new Map(hosts.map((h) => [h._id.toString(), h]));

            const result = counts.map((c) => {
                const host = hostById.get(c._id.toString());
                return {
                    hostId: c._id.toString(),
                    hostName: host?.name || "Unknown host",
                    hostCode: host?.code || null,
                    propertyCount: c.count,
                };
            });

            return Response.successResponse(res, res.statusCode, result);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // GET /properties-dashboard/duplicates — on-demand pairwise scan across
    // the whole property catalog, reusing roomProperties.js's checkConflict
    // matching predicate (see looksLikeDuplicate above). Deliberately not
    // auto-run on dashboard load — O(n^2) over every property — the frontend
    // fires this only when the admin clicks "Scan for duplicates". Read-only:
    // returns suspected pairs for manual review, never merges or deletes.
    duplicates: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const properties = await RoomProperty.find(
                {},
                { name: 1, address: 1, location: 1, hostId: 1, categoryId: 1 }
            )
                .populate("host", "name code")
                .lean({ virtuals: true });

            const pairs = [];
            for (let i = 0; i < properties.length; i++) {
                for (let j = i + 1; j < properties.length; j++) {
                    if (looksLikeDuplicate(properties[i], properties[j])) {
                        pairs.push([
                            summarizeForDuplicate(properties[i]),
                            summarizeForDuplicate(properties[j]),
                        ]);
                    }
                }
            }

            return Response.successResponse(res, res.statusCode, { pairs });
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // GET /properties-dashboard/compare?leftId=&rightId= — full side-by-side
    // detail for the "Compare" button on a duplicate pair: property fields,
    // host, and rooms (just enough to judge which is the "real" listing —
    // title/subtitle/price/quantity/photo, not booking-status fields that
    // don't help that judgment call).
    compare: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const { leftId, rightId } = req.query;
            if (!leftId || !rightId || leftId === rightId) {
                return Response.customResponse(res, 400, "leftId and rightId are required and must be different.");
            }

            const loadDetail = (id) =>
                RoomProperty.findById(id)
                    .populate("host", "name code email phone rating")
                    .populate({ path: "rooms", select: "title subtitle price currency quantity gallery code createdOn" })
                    .lean({ virtuals: true });

            const [left, right] = await Promise.all([loadDetail(leftId), loadDetail(rightId)]);
            if (!left || !right) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            const categoryIds = [left.categoryId, right.categoryId].filter(Boolean).map(String);
            const categories = categoryIds.length
                ? await Category.find({ _id: { $in: categoryIds } }, { name: 1 }).lean()
                : [];
            const categoryNameById = new Map(categories.map((c) => [c._id.toString(), c.name]));

            // .lean({ virtuals: true }) does not compute the schema's "id"
            // virtual in this Mongoose setup (verified directly — p.id comes
            // back undefined even though p._id is present), so every id here
            // is read off _id directly rather than relying on that virtual.
            const shape = (p) => ({
                id: p._id.toString(),
                name: p.name,
                address: p.address,
                categoryId: p.categoryId ? p.categoryId.toString() : null,
                categoryName: p.categoryId ? (categoryNameById.get(p.categoryId.toString()) || "Unknown") : null,
                createdOn: p.createdOn,
                host: p.host
                    ? {
                        id: p.host._id.toString(),
                        name: p.host.name,
                        code: p.host.code,
                        email: p.host.email,
                        phone: p.host.phone,
                        rating: p.host.rating,
                    }
                    : null,
                roomCount: p.rooms?.length ?? 0,
                rooms: (p.rooms || []).map((r) => ({
                    id: r._id.toString(),
                    title: r.title,
                    subtitle: r.subtitle,
                    price: r.price,
                    currency: r.currency,
                    quantity: r.quantity,
                    gallery: r.gallery,
                    code: r.code,
                    createdOn: r.createdOn,
                })),
            });

            return Response.successResponse(res, res.statusCode, { left: shape(left), right: shape(right) });
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // POST /properties-dashboard/merge — { keepId, mergeId }. Repoints every
    // room under mergeId onto keepId, confirms none are left behind, then
    // removes the now-empty mergeId property. No category/address gate here
    // (unlike scripts/mergeSameHostDuplicateProperties.js's automated merge)
    // — an admin has just reviewed both sides on the compare page and is
    // making an explicit, informed call, not relying on a heuristic to
    // decide unattended. The one thing that's never negotiable is data
    // safety: the emptied property is only deleted after Rooms confirms
    // zero of them still point at it.
    merge: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const { keepId, mergeId } = req.body || {};
            if (!keepId || !mergeId || keepId === mergeId) {
                return Response.customResponse(res, 400, "keepId and mergeId are required and must be different.");
            }

            const [keep, merge] = await Promise.all([RoomProperty.findById(keepId), RoomProperty.findById(mergeId)]);
            if (!keep || !merge) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            await Room.updateMany({ propertyId: merge._id }, { $set: { propertyId: keep._id } });

            const remaining = await Room.countDocuments({ propertyId: merge._id });
            if (remaining !== 0) {
                return Response.customResponse(
                    res,
                    500,
                    `${remaining} room(s) still reference the merged property — refusing to delete it. Please retry.`
                );
            }

            await RoomProperty.deleteOne({ _id: merge._id });
            await createActivityLog(
                "Properties",
                `Merged property "${merge.name}" (${merge.id}) into "${keep.name}" (${keep.id}) via duplicate compare`,
                req.user?.code
            );

            return Response.successResponse(res, res.statusCode, { keptId: keep.id, removedId: merge.id });
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // DELETE /properties-dashboard/property/:id — for a duplicate that turns
    // out to be junk/spam rather than mergeable. Safeguard: refuses to
    // delete if ANY of its rooms have a real reservation on record — a
    // duplicate listing worth deleting from the compare page should never
    // have live booking history; if it does, this isn't a simple duplicate
    // cleanup anymore and needs a human to look at the bookings directly.
    // Deletion itself reuses rooms.js's deleteOneRoom per room (same upload-
    // folder cleanup and empty-property cascade as deleting from the Rooms
    // page), not a raw bulk delete.
    deleteProperty: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const property = await RoomProperty.findById(req.params.id);
            if (!property) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            const rooms = await Room.find({ propertyId: property._id }, { _id: 1 }).lean();
            const roomIds = rooms.map((r) => r._id);

            if (roomIds.length) {
                const hasReservations = await Reservation.exists({ roomId: { $in: roomIds } });
                if (hasReservations) {
                    return Response.customResponse(
                        res,
                        409,
                        `"${property.name}" has room(s) with existing reservations — refusing to delete. Merge it into the other listing instead, or resolve those bookings first.`
                    );
                }
            }

            for (const roomId of roomIds) {
                await deleteOneRoom(roomId, req.user?.code, { deleteEmptyProperty: true });
            }
            // deleteOneRoom's own cascade already removes the property once its
            // last room is gone; this covers the case where it had none to
            // begin with (deleteOne on an already-gone id is a harmless no-op).
            await RoomProperty.deleteOne({ _id: property._id });

            await createActivityLog(
                "Properties",
                `Deleted property "${property.name}" (${property.id}) and ${roomIds.length} room(s) via duplicate compare`,
                req.user?.code
            );

            return Response.customResponse(res, res.statusCode, ResponseMessage.SUCCESS_MESSAGE);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    _testables: { looksLikeDuplicate, haversineKm, normalize },
};
