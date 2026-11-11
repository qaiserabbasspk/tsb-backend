const Host = require("../../models/hosts");
const RoomProperty = require("../../models/roomProperty");

const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const DateUtil = require("../../utilities/date_utility");
const { roomPropertyValidation } = require("../../validations/roomProperty");
const { isAdminUser, isHostUser } = require("../../utilities/roomVisibility_utility");

// Admin/host property-management endpoints for the "create a property"
// funnel (PROPERTY_ROOM_RESTRUCTURE_DECISIONS.md, Phase 4) — distinct from
// routes/version1/roomProperty.js (singular), which is the guest-facing
// property-detail read endpoint. Also distinct from the legacy, unused
// controllers/version1/properties.js (the old Rentrack real-estate
// "Property" model) — hence "room-properties" as this file's own URL
// prefix rather than "properties". Nothing here is reachable by an
// unauthenticated guest.

// Same mandatory coordinate gate as scripts/backfillPropertiesFromRooms.js's
// COORD_SANITY_KM — reused here so a host's real-time "is this the same
// property?" suggestion agrees with what the offline backfill would decide.
// (The backfill still additionally requires title or address to confirm on
// top of proximity; this endpoint is a lighter-weight nudge and doesn't.)
const SUGGEST_RADIUS_KM = 0.3;

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

// Resolves which hostId this request is allowed to act as. Admin staff may
// act on behalf of any host (must supply one); a host may only ever act as
// themselves — the supplied/query hostId, if any, is ignored in favor of
// their own id, rather than erroring, since a host has no legitimate reason
// to pass a different one and this is simpler than rejecting a mismatch.
// Returns null (caller responds) if neither role applies, or an admin
// omitted the required hostId.
const resolveActingHostId = (req, requestedHostId) => {
    if (isHostUser(req.user)) {
        return req.user.id;
    }
    if (isAdminUser(req.user)) {
        return requestedHostId || null;
    }
    return null;
};

module.exports = {
    // GET /room-properties/suggest?hostId=&latitude=&longitude=&city=
    // Real-time counterpart to the backfill script's clustering: does this
    // host already have a property within SUGGEST_RADIUS_KM, in the same
    // city, that this new room likely belongs to? Used to pre-select a
    // suggestion in the room-creation funnel instead of defaulting new
    // rooms to their own singleton property silently.
    suggest: async (req, res) => {
        try {
            const hostId = resolveActingHostId(req, req.query.hostId);
            if (!hostId) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const latitude = Number(req.query.latitude);
            const longitude = Number(req.query.longitude);
            const city = normalize(req.query.city);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !city) {
                return Response.successResponse(res, res.statusCode, { property: null, distanceKm: null });
            }

            const properties = await RoomProperty.find({ hostId }).populate("rooms");
            let nearest = null;
            let nearestDistanceKm = null;

            for (const property of properties) {
                if (
                    typeof property.location?.latitude !== "number" ||
                    typeof property.location?.longitude !== "number" ||
                    normalize(property.address?.city) !== city
                ) {
                    continue;
                }
                const distanceKm = haversineKm(
                    { latitude, longitude },
                    property.location
                );
                if (distanceKm <= SUGGEST_RADIUS_KM && (nearestDistanceKm === null || distanceKm < nearestDistanceKm)) {
                    nearest = property;
                    nearestDistanceKm = distanceKm;
                }
            }

            if (!nearest) {
                return Response.successResponse(res, res.statusCode, { property: null, distanceKm: null });
            }

            return Response.successResponse(res, res.statusCode, {
                property: {
                    id: nearest.id,
                    name: nearest.name,
                    address: nearest.address,
                    location: nearest.location,
                    categoryId: nearest.categoryId,
                    roomCount: nearest.rooms?.length ?? 0,
                },
                distanceKm: Math.round(nearestDistanceKm * 1000) / 1000,
            });
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // GET /room-properties/check-conflict?name=&street=&latitude=&longitude=&city=&hostId=
    // "Is a DIFFERENT host already listing what looks like this same
    // property?" — a warning-only signal for the host creating a new
    // property, deliberately much lighter-weight than `suggest`: it never
    // returns which host owns the match, that host's address, or anything
    // else about their listing, since — unlike suggest's "here's your own
    // other property" — this is another party's private business data.
    // Also deliberately does NOT change reviewStatus or flag anything for
    // admin review; the global review-on-submit setting (if enabled)
    // already governs whether this listing needs approval, same as any
    // other new property. This endpoint only powers a client-side heads-up.
    //
    // Name alone is NOT sufficient — two different hosts (or the same host)
    // can legitimately have properties that share a name but sit at
    // different addresses. A conflict requires the name AND the address to
    // both line up (address = street text similarity OR within
    // SUGGEST_RADIUS_KM). If no address was supplied at all yet, there's
    // nothing to confirm against, so no conflict is reported.
    checkConflict: async (req, res) => {
        try {
            const hostId = resolveActingHostId(req, req.query.hostId);
            if (!hostId) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const name = normalize(req.query.name);
            if (!name) {
                return Response.successResponse(res, res.statusCode, { conflict: false });
            }

            const street = normalize(req.query.street);
            const latitude = Number(req.query.latitude);
            const longitude = Number(req.query.longitude);
            const city = normalize(req.query.city);
            const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude) && !!city;

            const others = await RoomProperty.find(
                { hostId: { $ne: hostId } },
                { name: 1, address: 1, location: 1 }
            ).lean();

            const conflict = others.some((p) => {
                const otherName = normalize(p.name);
                const nameMatches = otherName === name || otherName.includes(name) || name.includes(otherName);
                if (!nameMatches) return false;

                const otherStreet = normalize(p.address?.street);
                const addressTextMatches =
                    !!street && !!otherStreet &&
                    (otherStreet === street || otherStreet.includes(street) || street.includes(otherStreet));

                const proximityMatches =
                    hasCoords &&
                    typeof p.location?.latitude === "number" &&
                    typeof p.location?.longitude === "number" &&
                    normalize(p.address?.city) === city &&
                    haversineKm({ latitude, longitude }, p.location) <= SUGGEST_RADIUS_KM;

                return addressTextMatches || proximityMatches;
            });

            return Response.successResponse(res, res.statusCode, { conflict });
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // GET /room-properties/host/:code — lists a host's own properties (id,
    // name, address, room count) for the "pick a different existing
    // property" fallback. Private management data, not a public listing —
    // unlike rooms.js's getByHost there is no legitimate "stranger views
    // this host's property list" case, so this simply denies access rather
    // than degrading to a public-visibility subset.
    getByHost: async (req, res) => {
        try {
            const host = await Host.findOne({ code: req.params.code });
            if (!host) {
                return Response.customResponse(res, 404, ResponseMessage.NO_HOST_RECORD);
            }

            const canAccess =
                isAdminUser(req.user) || (isHostUser(req.user) && req.user.id === host.id);
            if (!canAccess) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const properties = await RoomProperty.find({ hostId: host.id }).populate("rooms").sort({ name: 1 });
            const data = properties.map((p) => ({
                id: p.id,
                name: p.name,
                address: p.address,
                location: p.location,
                categoryId: p.categoryId,
                roomCount: p.rooms?.length ?? 0,
            }));

            return Response.successResponse(res, res.statusCode, { data });
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // POST /room-properties — creates a standalone property, independent of
    // any room. `name` is the only required field; see
    // validations/roomProperty.js for why address/location stay optional.
    create: async (req, res) => {
        try {
            const body = req.body;
            const hostId = resolveActingHostId(req, body.hostId);
            if (!hostId) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const { error } = roomPropertyValidation({ ...body, hostId });
            if (error) {
                return Response.customResponse(res, 400, error.details[0].message);
            }

            const host = await Host.findById(hostId);
            if (!host) {
                return Response.customResponse(res, 404, ResponseMessage.NO_HOST_RECORD);
            }

            const property = await RoomProperty.create({
                hostId,
                name: body.name,
                categoryId: body.categoryId,
                address: body.address,
                location: body.location,
                createdOn: DateUtil.currentDate(),
            });

            return Response.successResponse(res, 201, property.toJSON());
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },
};
