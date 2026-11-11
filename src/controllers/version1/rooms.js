const Room = require("../../models/rooms");
const RoomProperty = require("../../models/roomProperty");
const Host = require("../../models/hosts");
const Category = require("../../models/category");
const Reservation = require("../../models/reservation");
const BlockedDate = require("../../models/blockedDates");
const { roomsValidation } = require("../../validations/rooms");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const unique = require("../../utilities/codegenerator_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/qbActivityLog_utility");
const { sendEmail } = require("../../utilities/quickbookingEmailer_utility");
const { getSettings } = require("../../utilities/settings_utility");
const { approvedVisibilityFilter, isAdminUser, isHostUser, canViewUnapproved, hasValidPreviewToken } = require("../../utilities/roomVisibility_utility");
const { buildRoomDetailPayload } = require("../../utilities/roomDetailPayload_utility");
const { getGeoPlaceIndex, resolvePlaceSearch, isKnownPlacePrefix } = require("../../utilities/geoPlaceResolver_utility");
const { niceRoundUp, buildCurrencyRateMap, annotateConvertedPrice } = require("../../utilities/priceConversion_utility");
const { isSupportedCurrency, DEFAULT_CURRENCY } = require("../../utilities/supportedCurrencies_utility");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { sign, verify } = require("jsonwebtoken");

const moduleName = `Rooms`;

// See priceBounds() below — the price-range slider's top end, in Naira,
// before conversion into whatever currency the guest is browsing in.
const PRICE_BOUNDS_REFERENCE_MAX_NGN = 500000;

// Neutralizes regex metacharacters in free-text search input before it goes
// into a Mongo $regex — otherwise a search term like "3br (lagos)" throws,
// and unbalanced/adversarial input risks catastrophic-backtracking patterns.
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Builds an admin room-list filter for a free-text search: matches the
// room's own title/subtitle, or the name of the property it belongs to.
// Needed because the property/room restructure lets multiple rooms share
// one property (e.g. "Oasis Hotel & Suites") without repeating that name
// on each room's own title — a plain room.title match alone misses those.
const buildAdminRoomSearchFilter = async (rawTerm, extraPropertyFilter) => {
    const term = escapeRegex(String(rawTerm || "").trim());
    if (!term) return null;

    const matchingProperties = await RoomProperty.find({
        ...extraPropertyFilter,
        name: { $regex: term, $options: "i" },
    }).select("_id");

    return {
        $or: [
            { title: { $regex: term, $options: "i" } },
            { subtitle: { $regex: term, $options: "i" } },
            { propertyId: { $in: matchingProperties.map((p) => p._id) } },
        ],
    };
};

// Builds the admin room-list's structured filter fields (category, geo,
// capacity minimums, price range, review status) into a plain Mongo query —
// deliberately separate from buildAdminRoomSearchFilter (free-text) so the
// two can be combined with a simple object spread (disjoint key sets: this
// never produces `$or`). Shared by getAllForAdmin and getByHost so an
// admin's and a host's own "View Rooms" filter forms behave identically.
//
// Field semantics mirror search()'s guest-facing query building exactly
// (case-insensitive exact-match country/city, $gte capacity minimums, $gte/
// $lte price range) so admins/hosts get results consistent with what a
// guest would see under the same filters.
const buildAdminRoomFilterQuery = (query) => {
    const filter = {};

    if (query.categoryId) filter.categoryId = query.categoryId;
    if (query.country) filter["address.country"] = { $regex: `^${escapeRegex(String(query.country))}$`, $options: "i" };
    if (query.city) filter["address.city"] = { $regex: `^${escapeRegex(String(query.city))}$`, $options: "i" };

    const guests = Number(query.guests);
    if (guests) filter.guests = { $gte: guests };
    const bedroom = Number(query.bedroom);
    if (bedroom) filter.bedroom = { $gte: bedroom };
    const bed = Number(query.bed);
    if (bed) filter.bed = { $gte: bed };
    const bath = Number(query.bath);
    if (bath) filter.bath = { $gte: bath };

    const minPrice = Number(query.minPrice);
    const maxPrice = Number(query.maxPrice);
    if (minPrice || maxPrice) {
        filter.price = {};
        if (minPrice) filter.price.$gte = minPrice;
        if (maxPrice) filter.price.$lte = maxPrice;
    }

    if (query.reviewStatus) filter.reviewStatus = query.reviewStatus;

    return filter;
};

// Maps the admin filter form's sortBy choice to a Mongo sort spec. Falls
// back to `_id: -1` (newest-first by insertion order) — the same default
// getAllForAdmin has always used for its plain unfiltered list — for an
// unrecognized or absent sortBy.
//
// Only fields stored directly on the Room document are supported here.
// Category/host/property name are populated from other collections and
// can't be sorted with a plain `.sort()` — those columns are intentionally
// left unsortable in the admin table rather than faked with an in-memory
// sort of just the current page.
const ADMIN_SORT_FIELDS = {
    code: "code",
    title: "title",
    price: "price",
    rating: "rating",
    guests: "guests",
    bedroom: "bedroom",
    bed: "bed",
    bath: "bath",
    status: "status",
    reviewStatus: "reviewStatus",
    city: "address.city",
    country: "address.country",
    createdOn: "createdOn",
    updatedOn: "updatedOn",
};
const adminSortFor = (sortBy) => {
    if (typeof sortBy === "string") {
        const separatorIndex = sortBy.lastIndexOf("_");
        const key = sortBy.slice(0, separatorIndex);
        const direction = sortBy.slice(separatorIndex + 1);
        const field = ADMIN_SORT_FIELDS[key];
        if (field && (direction === "asc" || direction === "desc")) {
            return { [field]: direction === "asc" ? 1 : -1 };
        }
    }
    return { _id: -1 };
};

// Ids of rooms whose booked+blocked units meet or exceed capacity for the
// given date range. Shared by search() (guest availability filter) and
// getAllForAdmin/getByHost (admin/host's own checkIn/checkOut filter) so
// both use exactly the same "fully booked" definition.
const computeFullyBookedRoomIds = async (checkIn, checkOut) => {
    const [bookingAgg, blockedAgg] = await Promise.all([
        Reservation.aggregate([
            {
                $match: {
                    checkIn: { $lt: new Date(checkOut) },
                    checkOut: { $gt: new Date(checkIn) },
                    status: { $nin: ["Cancelled", "Checked Out"] }
                }
            },
            {
                $group: {
                    _id: "$roomId",
                    bookedUnits: { $sum: { $ifNull: ["$quantity", 1] } }
                }
            }
        ]),
        BlockedDate.aggregate([
            {
                $match: {
                    startDate: { $lt: new Date(checkOut) },
                    endDate: { $gt: new Date(checkIn) }
                }
            },
            {
                $group: {
                    _id: "$roomId",
                    blockedUnits: { $sum: { $ifNull: ["$quantity", 1] } }
                }
            }
        ]),
    ]);

    const unitsByRoom = new Map();
    for (const b of bookingAgg) {
        unitsByRoom.set(b._id.toString(), b.bookedUnits);
    }
    for (const b of blockedAgg) {
        const key = b._id.toString();
        unitsByRoom.set(key, (unitsByRoom.get(key) || 0) + b.blockedUnits);
    }

    if (unitsByRoom.size === 0) {
        return [];
    }

    const roomIds = [...unitsByRoom.keys()];
    const roomQuantities = await Room.find({ _id: { $in: roomIds } }).select("_id quantity");
    return roomQuantities
        .filter((r) => unitsByRoom.get(r._id.toString()) >= (r.quantity || 1))
        .map((r) => r._id);
};

// Checks whether `searchtext` matches a real country/city already in the
// catalog. Shared by buildSearchTextOr (decides which fields to search) and
// the street-proximity ranking block in search() (decides whether a street
// match should anchor a "nearby alternatives" radius search at all) — both
// need the same "is this actually a resolvable place" signal, computed once
// rather than each guessing independently.
const searchTextMatchesKnownPlace = async (searchtext) => {
    const search = { $regex: searchtext, $options: 'i' };
    const match = await Room.exists({
        $or: [{ 'address.country': search }, { 'address.city': search }],
    });
    return !!match;
};

// Builds the $or for a guest-facing free-text search. When the caller
// already picked an explicit country/city (the main availability search bar,
// once a location suggestion is resolved), or the raw term itself matches a
// real country/city in the catalog, this is a genuine place search — scope
// strictly to geo fields so a title/subtitle coincidence elsewhere can't
// leak in an unrelated country.
//
// Otherwise (the list page's sidebar "Search by region, name.." box sends
// free text with no resolved country/city, and the term matches no real
// place either) fall through to the full keyword search unchanged, so
// amenity names, host brand names, area names, etc. keep working.
const buildSearchTextOr = (searchtext, isRecognizedPlaceSearch) => {
    const search = { $regex: searchtext, $options: 'i' };
    if (isRecognizedPlaceSearch) {
        return [
            { 'address.country': search },
            { 'address.city': search },
        ];
    }
    return [
        { title: search },
        { subtitle: search },
        { 'address.street': search },
        { 'address.city': search },
        { 'address.country': search }
    ];
};

// Shared by buildFallbackSearchOr and its match-count ranking in search() —
// splits a free-text search into individually-matchable words, escaping
// regex specials and dropping stray single-character tokens.
const tokenizeSearchWords = (searchtext) =>
    String(searchtext)
        .split(/\s+/)
        .map((w) => escapeRegex(w.trim()))
        .filter((w) => w.length > 1);

// Fallback for a multi-word free-text search that found nothing under
// buildSearchTextOr's strict whole-phrase-per-field matching (e.g. "osapa
// apartment" — no single field contains that exact phrase, even though
// "osapa" alone matches the street). Splits into words and matches ANY word
// in ANY of the same fields, so a near-miss still returns something instead
// of a hard zero.
//
// Deliberately only ever invoked as a last-resort retry in search() when the
// strict search already returned zero results — never blended with it, and
// never used for a recognized-place (country/city-scoped) search — so it
// can only ADD a result to an already-empty search, and can't loosen or leak
// unrelated matches into a search that already works.
const buildFallbackSearchOr = (searchtext) => {
    const words = tokenizeSearchWords(searchtext);
    if (words.length === 0) return [];

    const fields = ['title', 'subtitle', 'address.street', 'address.city', 'address.country'];
    return fields.flatMap((field) =>
        words.map((word) => ({ [field]: { $regex: word, $options: 'i' } }))
    );
};

// Attaches each room's property name under a new `propertyName` field,
// without touching `propertyId` — deliberately NOT a populate() on
// propertyId itself, since that would turn it from the plain id string
// every existing consumer (edit-rooms' "change property" flow, etc.)
// expects into a nested object and silently break them.
const attachPropertyNames = async (rooms) => {
    const propertyIds = [...new Set(
        rooms.map((r) => r.propertyId).filter(Boolean).map((id) => id.toString())
    )];
    if (propertyIds.length === 0) return rooms.map((r) => ({ ...r.toJSON() }));

    const properties = await RoomProperty.find({ _id: { $in: propertyIds } }).select("id name");
    const nameById = new Map(properties.map((p) => [p.id, p.name]));

    return rooms.map((r) => ({
        ...r.toJSON(),
        propertyName: r.propertyId ? nameById.get(r.propertyId.toString()) : undefined,
    }));
};

// Deterministic pseudo-random ordering key for a given (room id, seed) pair.
// Same seed always yields the same relative order — stable across paginated
// requests within one browsing session/search — while a different seed
// (a fresh one per session, generated client-side) reshuffles the order.
// This replaces sorting by a stored `randomNumber` field, which never
// changed after a room was created and so gave every visitor the exact same
// "random" order forever.
const seededOrderKey = (id, seed) =>
    parseInt(crypto.createHash("md5").update(`${id}:${seed}`).digest("hex").slice(0, 8), 16);

// Returns a comparator for an explicit sortBy choice, or null for "relevant"
// (the caller's own default ordering — seeded shuffle, distance, rank —
// applies instead). Shared by the near-me and street-proximity branches below
// so picking a sort in the UI still takes effect once a location filter
// (quick-location pill or "near me") is active, instead of always being
// silently overridden by that branch's own distance/rank ordering.
// price_asc/price_desc prefer priceConverted (currency-aware, set by
// annotateConvertedPrice) and only fall back to the raw price when no
// conversion was requested for this search — see needsPriceConversion in
// search() below.
const sortComparatorFor = (sortBy) => {
    if (sortBy === 'price_asc') return (a, b) => (a.priceConverted ?? a.price ?? 0) - (b.priceConverted ?? b.price ?? 0);
    if (sortBy === 'price_desc') return (a, b) => (b.priceConverted ?? b.price ?? 0) - (a.priceConverted ?? a.price ?? 0);
    if (sortBy === 'createdOn_desc') return (a, b) => new Date(b.createdOn) - new Date(a.createdOn);
    if (sortBy === 'title_asc') return (a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
    if (sortBy === 'title_desc') return (a, b) => (b.title || '').localeCompare(a.title || '', undefined, { sensitivity: 'base' });
    return null;
};

// True when a room (already annotated with priceConverted, see
// annotateConvertedPrice) falls within [minPrice, maxPrice] — both expressed
// in the same currency priceConverted was computed against. A room whose
// currency had no resolvable rate (priceConverted null) is excluded rather
// than assumed to pass, since its real position relative to the range can't
// be confirmed. No-op (always true) when neither bound is set.
const roomWithinPriceRange = (room, minPrice, maxPrice) => {
    if (!minPrice && !maxPrice) return true;
    if (room.priceConverted == null) return false;
    if (minPrice && room.priceConverted < minPrice) return false;
    if (maxPrice && room.priceConverted > maxPrice) return false;
    return true;
};

// --- YouTube normalization helpers ---
// Accepts common YouTube URL shapes and returns an embeddable URL
// https://www.youtube.com/embed/<VIDEO_ID> or null when not parseable.
const extractYouTubeId = (url) => {
    if (!url || typeof url !== 'string') return null;
    try {
        const u = new URL(url, 'https://dummy.base'); // base for protocol-relative
        const host = (u.host || '').toLowerCase();

        // youtu.be/<id>
        if (host.endsWith('youtu.be')) {
            const id = (u.pathname || '').slice(1).split('/')[0];
            return id || null;
        }

        if (host.endsWith('youtube.com') || host.endsWith('www.youtube.com')) {
            // /watch?v=<id>
            if (u.pathname === '/watch') {
                const id = u.searchParams.get('v');
                return id || null;
            }
            // /shorts/<id>
            if (u.pathname.startsWith('/shorts/')) {
                const id = u.pathname.split('/')[2] || null;
                return id || null;
            }
            // /embed/<id>
            if (u.pathname.startsWith('/embed/')) {
                const id = u.pathname.split('/')[2] || null;
                return id || null;
            }
        }
    } catch (_) {
        // fallthrough to null
    }
    return null;
};

const toYouTubeEmbedUrl = (url) => {
    const id = extractYouTubeId(url);
    return id ? `https://www.youtube.com/embed/${id}` : null;
};

const stripHtmlTags = (html) => html.replace(/<[^>]*>/g, "").trim();

// Short-lived, room-scoped token behind the admin/host "preview" action.
// Needed because that preview opens the public guest site in a new tab/origin
// — the admin portal's own session token isn't available there — so the
// portal mints this instead, scoped to one room and expiring quickly, rather
// than the guest site trusting "any logged-in user" the way it used to.
const PREVIEW_TOKEN_TTL = "10m";
const signPreviewToken = (roomId) =>
    sign({ type: "roomPreview", roomId: roomId.toString() }, process.env.JWK_SECRET, {
        expiresIn: PREVIEW_TOKEN_TTL,
    });

// In-memory cache for the top-cities endpoint — refreshes at most once per week.
let topCitiesCache = null;
let topCitiesCachedAt = 0;
const TOP_CITIES_TTL_MS = 7 * 24 * 60 * 60 * 1000;

//--- "Related properties" scoring (getRelated) ---
// Ranks same-category, same-currency, same-country listings by how good a
// substitute they are for the source room: geographic proximity, capacity,
// price, room count, and amenity overlap. Currency and country are hard
// filters (not scoring factors) — comparing raw NGN vs USD numbers is
// meaningless, and a "related" stay in another country isn't a substitute.
// Deliberately ignores `rating` — it's a placeholder default today, not real
// guest data, so it carries no ranking signal.

const toRad = (deg) => (deg * Math.PI) / 180;

const haversineKm = (a, b) => {
    if (
        typeof a?.latitude !== "number" || typeof a?.longitude !== "number" ||
        typeof b?.latitude !== "number" || typeof b?.longitude !== "number"
    ) {
        return null;
    }
    const R = 6371;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

// Hard boundary (not just a sort key) for proximity-based search fallbacks
// (near-me, street-proximity Rank 2 below). Distances beyond this — and
// rooms whose distance can't be verified at all (no coordinates) — are
// dropped rather than padded in, so a Lekki search never surfaces a Kano or
// Accra listing just to fill out the page.
const MAX_SEARCH_RADIUS_KM = 120;

// Tighter radius used only for padding a thin area with its nearby areas in
// the quick-location-filters row (topStreets below) — a genuinely "nearby"
// neighbourhood cluster, not the wider net near-me/search allow themselves.
const AREA_NEARBY_RADIUS_KM = 50;

// Cheap DB-side pre-filter for the proximity searches below: a lat/lng
// bounding box is a superset of the true circle (corners stick out past
// MAX_SEARCH_RADIUS_KM), so haversineKm is still the exact correctness
// check afterward — this just narrows what gets fetched from the DB before
// that check runs.
const boundingBoxForRadius = (origin, radiusKm) => {
    const latDelta = radiusKm / 111.045; // km per degree of latitude, ~constant
    // Longitude degrees shrink toward the poles by cos(latitude); clamp so a
    // pathological origin latitude can't blow this up to an unbounded box.
    const cosLat = Math.max(Math.cos(toRad(origin.latitude)), 0.01);
    const lonDelta = radiusKm / (111.045 * cosLat);
    return {
        minLat: origin.latitude - latDelta,
        maxLat: origin.latitude + latDelta,
        minLon: origin.longitude - lonDelta,
        maxLon: origin.longitude + lonDelta,
    };
};

// address.street has no reliable structure across listings — sometimes
// "Neighbourhood, City" (2 parts), sometimes a full messy address, sometimes
// just a literal street/postal string with no neighbourhood at all (see
// suggest() above for the same comma-split, house-number-strip convention).
// This picks exactly one "area" per listing for grouping/counting, unlike
// suggest()'s "extract every matching token" (which is fine for live-search
// matching but would double-count a listing under multiple labels here).
// Returns null when nothing beyond the street/city/country itself is usable
// (e.g. Milan's "Viale Isonzo, 14, 20135") — that listing is simply excluded
// from area grouping rather than forced into a nonsense label.
const extractPrimaryAreaToken = (street, city, country) => {
    const parts = (street || '').split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    const cityLower = (city || '').toLowerCase();
    const countryLower = (country || '').toLowerCase();
    const isUsable = (token) => {
        const tokenLower = token.toLowerCase();
        return token.length > 2 && tokenLower !== cityLower && tokenLower !== countryLower;
    };

    // Prefer a later segment first — this correctly picks the neighbourhood
    // out of "Street, Neighbourhood[, City...]" shapes (e.g. "Admiralty Way,
    // Lekki Phase 1" -> "Lekki Phase 1") without ever considering segment 0,
    // which is a genuine street name in that shape.
    for (let i = 1; i < parts.length; i++) {
        if (isUsable(parts[i])) return parts[i];
    }
    // Nothing usable after segment 0 (every later segment was just the city/
    // country, or there was no comma at all) — segment 0 itself must be the
    // neighbourhood, e.g. "Victoria Island, Lagos" -> "Victoria Island".
    if (isUsable(parts[0])) return parts[0];
    return null;
};

// Extracts the street-name token (segment 0, house number stripped) using
// the same convention as suggest() — the specific address, as opposed to
// the broader neighbourhood extractPrimaryAreaToken above returns.
const extractStreetToken = (street) => {
    const first = (street || '').split(',')[0]?.trim() ?? '';
    const token = first.replace(/^\d+\s+/, '');
    return token.length > 2 ? token : null;
};

// Maps a "lower difference is better" raw value to a 0..1 score. `scale` is
// the difference at which the score drops to 0.5 (half-life), tuned per
// factor below. Unknown/missing input is treated as neutral, not penalized.
const closenessScore = (diff, scale) => {
    if (diff == null || Number.isNaN(diff)) return 0.5;
    return 1 / (1 + diff / scale);
};

const amenityIdsOf = (room) =>
    (room.amenities || []).map((a) => a.id?.toString()).filter(Boolean);

const jaccardScore = (idsA, idsB) => {
    if (idsA.length === 0 && idsB.length === 0) return 0.5;
    const setA = new Set(idsA);
    const setB = new Set(idsB);
    let intersection = 0;
    for (const id of setA) {
        if (setB.has(id)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0.5 : intersection / union;
};

const relatedScoreOf = (source, candidate, sourceAmenityIds) => {
    const distanceKm = haversineKm(source.location, candidate.location);
    const distanceScore = distanceKm == null ? 0.5 : closenessScore(distanceKm, 10);

    const guestsScore = closenessScore(
        Math.abs((source.guests || 0) - (candidate.guests || 0)),
        2
    );

    // Currency is a hard filter on the candidate query, so every candidate
    // here already shares the source's currency — no need to gate this.
    const priceScore = source.price
        ? closenessScore(
              Math.abs(source.price - candidate.price) / source.price,
              0.3
          )
        : 0.5;

    const bedroomScore = closenessScore(
        Math.abs((source.bedroom || 0) - (candidate.bedroom || 0)),
        1
    );

    const amenityScore = jaccardScore(sourceAmenityIds, amenityIdsOf(candidate));

    return (
        distanceScore * 0.3 +
        guestsScore * 0.2 +
        priceScore * 0.2 +
        bedroomScore * 0.15 +
        amenityScore * 0.15
    );
};

const buildReviewEmail = ({ heading, intro, reason }) => {
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
<div style="padding: 20px; max-width: 560px;">
    <p style="margin: 0 0 16px; font-size: 13px; font-weight: 700; color: #5eac12; letter-spacing: 0.04em;">QUICKBOOKING</p>

    <h2 style="margin: 0 0 12px; color: #222;">${heading}</h2>

    <p>${intro}</p>

    ${reason ? `<p><strong>Reviewer notes:</strong> ${reason}</p>` : ""}

    <p>You can log in to your account at <a href="https://quickbooking.org/auth/sign-in" style="color: #5eac12;">quickbooking.org/auth/sign-in</a> to view this listing.</p>

    <p>If you have any questions, just reply to this email.</p>

    <p>Best regards,<br>
    The QuickBooking Team</p>

    <p style="font-size: 12px; color: #999; margin-top: 24px;">&copy; ${new Date().getFullYear()} QuickBooking. All rights reserved.</p>
</div>
</body>
</html>`;

    const text = `QuickBooking

${heading}

${stripHtmlTags(intro)}
${reason ? `\nReviewer notes: ${reason}\n` : ""}
You can log in to your account at https://quickbooking.org/auth/sign-in to view this listing.

If you have any questions, just reply to this email.

Best regards,
The QuickBooking Team

© ${new Date().getFullYear()} QuickBooking. All rights reserved.`;

    return { html, text };
};

const notifyAdminOfSubmission = (room, host, { isResubmission } = {}) => {
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
    if (!adminEmail) return;

    const subject = isResubmission
        ? `[Listing Resubmitted] ${room.code} — ${room.title}`
        : `[New Listing] ${room.code} — ${room.title}`;
    const html = `
    <div style="font-family: Arial, sans-serif; color: #333; padding: 20px; line-height: 1.6;">
    <h2 style="color: #5eac12;">${isResubmission ? "Listing Resubmitted for Review" : "New Listing Submitted for Review"}</h2>

    <p>${isResubmission ? "A previously rejected listing has been updated and resubmitted." : "A new listing is awaiting review before it can go live."}</p>

    <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
        <tr>
            <td style="padding: 8px; font-weight: bold;">Listing Code:</td>
            <td style="padding: 8px;">${room.code}</td>
        </tr>
        <tr>
            <td style="padding: 8px; font-weight: bold;">Title:</td>
            <td style="padding: 8px;">${room.title}</td>
        </tr>
        <tr>
            <td style="padding: 8px; font-weight: bold;">Host:</td>
            <td style="padding: 8px;">${host?.name ?? ""} (${host?.code ?? ""})</td>
        </tr>
        <tr>
            <td style="padding: 8px; font-weight: bold;">Address:</td>
            <td style="padding: 8px;">${room.address?.street ?? ""}, ${room.address?.city ?? ""}, ${room.address?.country ?? ""}</td>
        </tr>
    </table>

    <p>Visit the admin Listing Review queue to approve or reject this listing.</p>

    <a href="https://quickbooking.org" target="_blank">
    <img src="https://quickbooking.org/quickbooking-logo.png" alt="QuickBooking Logo" style="width: 150px; height: auto; margin-top: 20px;">
    </a>

    <p style="font-size: 12px; color: #aaa;">&copy; ${new Date().getFullYear()} QuickBooking. All rights reserved.</p>
    </div>
`;

    sendEmail(adminEmail, subject, html).catch((err) =>
        console.error("Email to admin failed:", err)
    );
};

// Resolves the RoomProperty a new Room should belong to. The Add Room form
// lets the host pick an existing property or create a new one; when neither
// happens (body.propertyId omitted), the room falls back to a fresh
// single-room property — this keeps propertyId always present on every
// Room going forward, so search/listing grouping logic never has to
// special-case a missing one.
// Returns null (caller responds 404) if an explicit propertyId was supplied
// but doesn't exist or belongs to a different host.
const resolveRoomPropertyId = async (body, host) => {
    if (body.propertyId) {
        const existing = await RoomProperty.findOne({
            _id: body.propertyId,
            hostId: host.id,
        });
        if (!existing) return null;
        // Self-heals properties created before category tracking existed —
        // the first room added to one after this change fills in its
        // category, so older properties get the "no need to reselect
        // category" behavior without a one-off migration touching every row.
        if (!existing.categoryId && body.categoryId) {
            existing.categoryId = body.categoryId;
            await existing.save();
        }
        return existing._id;
    }

    const property = await RoomProperty.create({
        hostId: host.id,
        name: body.title || `${host.name}'s property`,
        categoryId: body.categoryId,
        address: body.address,
        location: body.location,
        createdOn: DateUtil.currentDate(),
    });
    return property._id;
};

const propertyPopulateOptions = [
    { path: "host", select: "id name code avatar bio rating" },
];

const roomCardPopulateOptions = [
    { path: "amenitiesDetail", select: "id name icon iconCodePoint" },
    { path: "host", select: "id name code avatar bio rating" },
    { path: "featuresDetail", select: "id title subtitle icon iconCodePoint" },
    { path: "category", select: "id name icon iconCodePoint" },
];

// Builds one "property card" per property id, keyed by property id string.
// Shaped exactly like the existing per-room JSON response (title, address,
// price, gallery, bed/bath/guests, etc.) so every existing frontend consumer
// of these endpoints (search results, homepage "nearby", destination pages)
// keeps working unchanged — only the meaning of a couple of fields shifts:
// `id` is now the property id, `price` is the property's cheapest room's
// price, and a new `unitCount`/`representativeRoomId` pair is added.
//
// Per the Phase 3 pivot (PROPERTY_ROOM_RESTRUCTURE_DECISIONS.md), everything
// except title/address/location comes straight from the property's cheapest
// room's own authored content (description, gallery, amenities, features,
// category, youtubeUrl, host) — nothing is inferred or blended from the
// RoomProperty. title/address/location prefer the RoomProperty's own
// `name`/`address`/`location` (its only fields — Phase 1), falling back to
// the room's own values for the rare pre-restructure edge case where those
// are missing on the property.
//
// `matchingRoomIds` must be exactly the room ids that already passed the
// caller's search/filter query (category, price, bed/bath/guests, dates,
// review status, etc.) — NOT every room the property has ever listed.
// Aggregating over a property's full room set regardless of what matched
// would show/link a room the guest's filters actually excluded (e.g. a
// bedroom>=3 search surfacing the property's cheapest 1-bedroom room as the
// "representative" unit, because it happened to be cheaper overall).
const buildPropertyCards = async (propertyIds, matchingRoomIds) => {
    const [properties, rooms] = await Promise.all([
        RoomProperty.find({ _id: { $in: propertyIds } }).populate(propertyPopulateOptions),
        Room.find({ _id: { $in: matchingRoomIds } }).populate(roomCardPopulateOptions),
    ]);

    const propertyById = new Map(properties.map((p) => [p.id, p]));

    // A room that (defensively) still has no propertyId — shouldn't happen
    // post-migration, but resolveRoomPropertyId's own fallback treats a room
    // as its own single-room property using its own id — groups the same way.
    const roomsByPropertyId = new Map();
    for (const room of rooms) {
        const key = room.propertyId ? room.propertyId.toString() : room.id;
        if (!roomsByPropertyId.has(key)) {
            roomsByPropertyId.set(key, []);
        }
        roomsByPropertyId.get(key).push(room);
    }

    const cardById = new Map();
    for (const propId of propertyIds) {
        const memberRooms = roomsByPropertyId.get(propId) || [];
        if (memberRooms.length === 0) {
            continue;
        }

        const cheapest = memberRooms.reduce((min, r) =>
            (r.price || 0) < (min.price || 0) ? r : min
        );
        const property = propertyById.get(propId);
        const cheapestJson = cheapest.toJSON();

        cardById.set(propId, {
            ...cheapestJson,
            id: propId,
            title: property?.name || cheapestJson.title,
            address: property?.address || cheapestJson.address,
            location: property?.location || cheapestJson.location,
            price: Math.min(...memberRooms.map((r) => r.price || 0)),
            unitCount: memberRooms.length,
            representativeRoomId: cheapest.id,
        });
    }
    return cardById;
};

// Collapses a fully ordered list of matching room ids (already filtered and
// ranked by whichever strategy produced it — near-me distance, street-
// proximity two-tier rank, an explicit sortBy, or the default seeded
// shuffle) into one entry per property (first-occurrence order preserved —
// the best-ranked room in a property decides where that property appears),
// paginates over properties instead of rooms, and sends the paginated
// property-card response. This is the single shared tail every one of
// search()'s and getAll()'s ranking strategies now feeds into, instead of
// each hand-rolling its own room-level pagination.
const respondWithPropertyPage = async (req, res, orderedRoomIds) => {
    if (orderedRoomIds.length === 0) {
        return res.status(200).json({ page: 1, pages: 0, pageSize: 10, rows: 0, data: [] });
    }

    const roomPropertyRows = await Room.find({ _id: { $in: orderedRoomIds } })
        .select("_id propertyId")
        .lean();
    const propertyIdByRoom = new Map(
        roomPropertyRows.map((r) => [
            r._id.toString(),
            r.propertyId ? r.propertyId.toString() : r._id.toString(),
        ])
    );

    // Preserves, per property, exactly which of its rooms actually matched
    // this search — buildPropertyCards must aggregate over only these, not
    // every room the property has, or a card could represent/link a room
    // the caller's own filters excluded (see buildPropertyCards' comment).
    const orderedPropertyIds = [];
    const matchingRoomIdsByProperty = new Map();
    const seen = new Set();
    for (const roomId of orderedRoomIds) {
        const key = roomId.toString();
        const propId = propertyIdByRoom.get(key);
        if (!propId) {
            continue;
        }
        if (!seen.has(propId)) {
            seen.add(propId);
            orderedPropertyIds.push(propId);
        }
        if (!matchingRoomIdsByProperty.has(propId)) {
            matchingRoomIdsByProperty.set(propId, []);
        }
        matchingRoomIdsByProperty.get(propId).push(key);
    }

    const total = orderedPropertyIds.length;
    const { pagination, skip } = await PaginationUtility.paginationParams(req, total);

    if (pagination.page > pagination.pages) {
        return res.status(200).json({
            page: pagination.page,
            pages: pagination.pages,
            pageSize: pagination.pageSize,
            rows: total,
            data: [],
        });
    }

    const pagePropertyIds = orderedPropertyIds.slice(skip, skip + pagination.pageSize);
    const matchingRoomIds = pagePropertyIds.flatMap(
        (id) => matchingRoomIdsByProperty.get(id) || []
    );
    const cardById = await buildPropertyCards(pagePropertyIds, matchingRoomIds);
    pagination.data = pagePropertyIds.map((id) => cardById.get(id)).filter(Boolean);

    return Response.paginationResponse(res, res.statusCode, pagination);
};

// Shared per-room logic for approve/reject/delete/status, used by both the
// single-room routes and their /bulk counterparts below — the email +
// activity-log + cleanup side effects only need to live in one place.
const approveOneRoom = async (roomId, actorCode) => {
    const room = await Room.findById(roomId).populate("host");
    if (!room) return { id: roomId, ok: false, error: ResponseMessage.NO_RECORD };

    room.reviewStatus = "approved";
    room.reviewedBy = actorCode;
    room.reviewedOn = DateUtil.currentDate();
    room.rejectionReason = undefined;
    const updatedRoom = await room.save();

    await createActivityLog(moduleName, `Approved ${moduleName} - ${room.code}`, actorCode);

    if (room.host?.email) {
        const subject = `Your listing "${room.title}" is now live on QuickBooking`;
        const { html, text } = buildReviewEmail({
            heading: "Your Listing Is Live",
            intro: `Good news — your listing <strong>${room.title}</strong> (${room.code}) has been reviewed and is now live on QuickBooking.`,
        });
        sendEmail(room.host.email, subject, html, undefined, {
            text,
            replyTo: process.env.SUPPORT_EMAIL,
        }).catch((err) => console.error("Email to host failed:", err));
    }

    return { id: roomId, ok: true, room: updatedRoom };
};

const rejectOneRoom = async (roomId, actorCode, reason) => {
    const room = await Room.findById(roomId).populate("host");
    if (!room) return { id: roomId, ok: false, error: ResponseMessage.NO_RECORD };

    room.reviewStatus = "rejected";
    room.reviewedBy = actorCode;
    room.reviewedOn = DateUtil.currentDate();
    room.rejectionReason = reason;
    const updatedRoom = await room.save();

    await createActivityLog(moduleName, `Rejected ${moduleName} - ${room.code}`, actorCode);

    if (room.host?.email) {
        const subject = `Your listing "${room.title}" needs changes before it can go live`;
        const { html, text } = buildReviewEmail({
            heading: "Listing Needs Changes",
            intro: `Your listing <strong>${room.title}</strong> (${room.code}) was reviewed and could not go live yet.`,
            reason,
        });
        sendEmail(room.host.email, subject, html, undefined, {
            text,
            replyTo: process.env.SUPPORT_EMAIL,
        }).catch((err) => console.error("Email to host failed:", err));
    }

    return { id: roomId, ok: true, room: updatedRoom };
};

// Publish/unpublish are the post-approval counterpart to approve/reject —
// pulling (or restoring) an already-approved listing without sending it
// back through initial review. notifyHost is caller-controlled (unlike
// approve/reject, which always email) since an admin may be doing this for
// internal/ops reasons the host doesn't need to hear about immediately.
const publishOneRoom = async (roomId, actorCode, notifyHost) => {
    const room = await Room.findById(roomId).populate("host");
    if (!room) return { id: roomId, ok: false, error: ResponseMessage.NO_RECORD };
    if (room.reviewStatus !== "unpublished") {
        return { id: roomId, ok: false, error: "Only an unpublished listing can be published." };
    }

    room.reviewStatus = "approved";
    room.reviewedBy = actorCode;
    room.reviewedOn = DateUtil.currentDate();
    room.unpublishReason = undefined;
    const updatedRoom = await room.save();

    await createActivityLog(moduleName, `Published ${moduleName} - ${room.code}`, actorCode);

    if (notifyHost && room.host?.email) {
        const subject = `Your listing "${room.title}" is back live on QuickBooking`;
        const { html, text } = buildReviewEmail({
            heading: "Your Listing Is Back Live",
            intro: `Your listing <strong>${room.title}</strong> (${room.code}) is live again on QuickBooking.`,
        });
        sendEmail(room.host.email, subject, html, undefined, {
            text,
            replyTo: process.env.SUPPORT_EMAIL,
        }).catch((err) => console.error("Email to host failed:", err));
    }

    return { id: roomId, ok: true, room: updatedRoom };
};

const unpublishOneRoom = async (roomId, actorCode, reason, notifyHost) => {
    const room = await Room.findById(roomId).populate("host");
    if (!room) return { id: roomId, ok: false, error: ResponseMessage.NO_RECORD };
    if (room.reviewStatus !== "approved") {
        return { id: roomId, ok: false, error: "Only an approved listing can be unpublished." };
    }

    room.reviewStatus = "unpublished";
    room.reviewedBy = actorCode;
    room.reviewedOn = DateUtil.currentDate();
    room.unpublishReason = reason || undefined;
    const updatedRoom = await room.save();

    await createActivityLog(moduleName, `Unpublished ${moduleName} - ${room.code}`, actorCode);

    if (notifyHost && room.host?.email) {
        const subject = `Your listing "${room.title}" has been temporarily removed from QuickBooking`;
        const { html, text } = buildReviewEmail({
            heading: "Listing Temporarily Removed",
            intro: `Your listing <strong>${room.title}</strong> (${room.code}) has been temporarily taken down from QuickBooking.`,
            reason,
        });
        sendEmail(room.host.email, subject, html, undefined, {
            text,
            replyTo: process.env.SUPPORT_EMAIL,
        }).catch((err) => console.error("Email to host failed:", err));
    }

    return { id: roomId, ok: true, room: updatedRoom };
};

// A reservation only blocks deletion while it's still actually pending —
// once checkOut has passed, a stuck "Pending"/"Checked In" record (e.g. a
// no-show, or staff forgot to check the guest out) no longer represents a
// real obligation, so it shouldn't hold the room hostage forever.
const hasBlockingReservation = async (roomId) => {
    const count = await Reservation.countDocuments({
        roomId,
        status: { $in: ["Pending", "Checked In"] },
        checkOut: { $gt: DateUtil.currentDate() },
    });
    return count > 0;
};

const DELETE_BLOCKED_MESSAGE =
    "This room has an active or upcoming reservation and can't be deleted until it's complete.";
const HOST_DELETE_DEACTIVATED_MESSAGE =
    "This room has an active or upcoming reservation, so it's been unlisted instead of deleted. You'll be able to delete it once the stay is complete.";

// Host delete is a soft delete (record kept, hidden everywhere, files kept)
// so it can't break an existing guest's reservation history and an admin
// can restore it later. Admin delete stays the original hard delete. Both
// are blocked by an active/upcoming reservation — host instead falls back
// to deactivating the room (see HOST_DELETE_DEACTIVATED_MESSAGE above),
// since that's reversible and doesn't need admin intervention.
const deleteOneRoom = async (roomId, requestingUser, actionByCode, { deleteEmptyProperty = true } = {}) => {
    const room = await Room.findById(roomId);
    if (!room) return { id: roomId, ok: false, error: ResponseMessage.NO_RECORD };

    const actingAsHost = isHostUser(requestingUser);
    const actingAsAdmin = isAdminUser(requestingUser);

    if (!actingAsHost && !actingAsAdmin) {
        return { id: roomId, ok: false, error: ResponseMessage.ACCESS_DENIED };
    }
    if (actingAsHost && String(room.hostId) !== String(requestingUser.id)) {
        return { id: roomId, ok: false, error: ResponseMessage.ACCESS_DENIED };
    }

    if (await hasBlockingReservation(roomId)) {
        if (!actingAsHost) {
            return { id: roomId, ok: false, error: DELETE_BLOCKED_MESSAGE };
        }
        room.status = 0;
        room.updatedOn = DateUtil.currentDate();
        await room.save();
        await createActivityLog(
            moduleName,
            `Auto-deactivated ${moduleName} (delete blocked by active reservation) - ${room.code}`,
            actionByCode
        );
        return { id: roomId, ok: true, action: "deactivated", message: HOST_DELETE_DEACTIVATED_MESSAGE };
    }

    if (actingAsHost) {
        room.isDeleted = true;
        room.deletedOn = DateUtil.currentDate();
        room.deletedBy = actionByCode;
        room.updatedOn = DateUtil.currentDate();
        await room.save();
        await createActivityLog(moduleName, `Soft-deleted ${moduleName} - ${room.code}`, actionByCode);
        return { id: roomId, ok: true, action: "deleted" };
    }

    const roomFolder = path.join(__dirname, "..", "..", "uploads", "rooms", room.code);
    if (fs.existsSync(roomFolder)) {
        fs.rmSync(roomFolder, { recursive: true, force: true });
    }

    await room.deleteOne();

    if (room.propertyId && deleteEmptyProperty) {
        const remaining = await Room.countDocuments({ propertyId: room.propertyId });
        if (remaining === 0) {
            await RoomProperty.deleteOne({ _id: room.propertyId });
        }
    }

    await createActivityLog(moduleName, `Deleted ${moduleName} - ${room.code}`, actionByCode);

    return { id: roomId, ok: true, action: "deleted" };
};

// Bulk-action request bodies send `{ ids: [...] }` — normalizes + caps that
// input once so every bulk handler below rejects the same bad shapes the
// same way.
const MAX_BULK_ROOM_IDS = 100;
const extractRoomIds = (req) => {
    const ids = req.body?.ids;
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string" && id) : [];
};
// `deactivated` only ever gets entries from bulkDelete's host-fallback path
// (see deleteOneRoom) — every other bulk action never sets r.action, so
// this bucket stays empty for them and they behave exactly as before.
const summarizeBulkResults = (results) => ({
    succeeded: results.filter((r) => r.ok && r.action !== "deactivated").map((r) => r.id),
    deactivated: results.filter((r) => r.ok && r.action === "deactivated").map((r) => r.id),
    failed: results.filter((r) => !r.ok).map((r) => ({ id: r.id, error: r.error })),
});

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;
            const uniqueCode = unique.randomCode();
            const { error } = roomsValidation(body);

            if (error) {
                return Response.sendValidationErrorMessage(res, 400, error);
            }

            const host = await Host.findById(body.hostId);
            const category = await Category.findById(body.categoryId);

            if (!host)
                return Response.customResponse(res, 404, ResponseMessage.HOST_LOGIN_REQUIRED);

            if (!category)
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            // When the super admin has switched listing review off, new listings
            // go live immediately (approved) and no review email is sent.
            const { listingReviewEnabled } = await getSettings();

            const propertyId = await resolveRoomPropertyId(body, host);
            if (propertyId === null) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            const room = new Room({
                code: "RO" + uniqueCode,
                title: body.title,
                subtitle: body.subtitle,
                description: body.description,
                gallery: body.gallery.map((per) => ({
                    name: per.name,
                })),
                location: body.location,
                rating: body.rating ?? 0,
                hostRatingSet: body.rating !== null && body.rating !== undefined,
                amenities: body.amenities,
                address: body.address,
                price: body.price,
                youtubeUrl: toYouTubeEmbedUrl(body.youtubeUrl),
                hasRefundableCautionFee: body.hasRefundableCautionFee,
                refundableCautionFee: body.refundableCautionFee,
                currency: body.currency,
                guests: body.guests,
                bedroom: body.bedroom,
                bed: body.bed,
                bath: body.bath,
                hostId: body.hostId,
                propertyId,
                features: body.features,
                categoryId: body.categoryId,
                status: 1,
                reviewStatus: listingReviewEnabled ? "pending" : "approved",
                quantity: body.quantity,
                availableRooms: body.availableRooms,
                createdOn: DateUtil.currentDate(),
                randomNumber: Math.random()
            });

            const newRoom = await room.save();

            const action = `New ${moduleName}- ${newRoom.code}`;
            await createActivityLog(moduleName, action, host.code);

            if (listingReviewEnabled) {
                notifyAdminOfSubmission(newRoom, host);
            }

            return Response.successResponse(res, res.statusCode, newRoom);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
        try {
            // A deactivated room (status 0) is the host's own "paused" state —
            // it must never surface in the default guest browse listing, same
            // as an unapproved one. Admin still sees everything (bypass below).
            const visibilityQuery = isAdminUser(req.user) ? {} : { status: 1, ...approvedVisibilityFilter() };

            let orderedRoomIds;
            if (req.query.sortBy === 'createdOn_desc') {
                const idRows = await Room.find(visibilityQuery)
                    .select('_id')
                    .sort({ createdOn: -1 })
                    .lean();
                orderedRoomIds = idRows.map((r) => r._id.toString());
            } else {
                // "Relevant" (default) order — shuffled per browsing session via a
                // client-supplied seed instead of a stored random field (see
                // seededOrderKey above).
                const seed = (typeof req.query.seed === 'string' && req.query.seed.trim()) || 'default';
                const idRows = await Room.find(visibilityQuery).select('_id').lean();
                orderedRoomIds = idRows
                    .map((r) => r._id.toString())
                    .sort((a, b) => seededOrderKey(a, seed) - seededOrderKey(b, seed));
            }

            return respondWithPropertyPage(req, res, orderedRoomIds);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // Admin room-management listing — flat, one row per Room with its real
    // id, across every host. Deliberately separate from getAll() above:
    // that endpoint now returns one grouped property-card per property (for
    // guest browsing), whose "id" is the RoomProperty id, not the room's —
    // admin CRUD (edit/delete/approve/reject, hot-deal and reservation room
    // pickers) needs the real per-room id and shouldn't be coupled to how
    // guest browsing groups rooms.
    getAllForAdmin: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const filterQuery = buildAdminRoomFilterQuery(req.query);
            const searchFilter = await buildAdminRoomSearchFilter(req.query.search);
            const query = { ...filterQuery, ...(searchFilter || {}) };

            // "deleted" isn't a real reviewStatus value — it's a stand-in the
            // admin filter dropdown uses to flip into a dedicated view of
            // soft-deleted rooms (for potential restore) instead of the
            // normal listing, which always excludes them.
            if (query.reviewStatus === "deleted") {
                delete query.reviewStatus;
                query.isDeleted = true;
            } else {
                query.isDeleted = { $ne: true };
            }

            if (req.query.checkIn && req.query.checkOut) {
                const fullyBookedIds = await computeFullyBookedRoomIds(req.query.checkIn, req.query.checkOut);
                if (fullyBookedIds.length > 0) {
                    query._id = { $nin: fullyBookedIds };
                }
            }

            const totalRooms = await Room.countDocuments(query);
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalRooms
            );

            // Only a genuinely out-of-range page (data exists, but not at this
            // page) is an error — zero total matches (empty catalog, or a
            // search with no hits) is a normal, valid empty result, not one.
            if (totalRooms > 0 && pagination.page > pagination.pages) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.OUTOF_DATA
                );
            }

            const rooms = totalRooms === 0
                ? []
                : await Room.find(query)
                    .populate(roomCardPopulateOptions)
                    .sort(adminSortFor(req.query.sortBy))
                    .skip(skip)
                    .limit(pagination.pageSize);

            pagination.data = await attachPropertyNames(rooms);

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getByHost: async (req, res) => {
        try {
            const host = await Host.findOne({ code: req.params.code });

            if (!host) {
                return Response.customResponse(res, 404, ResponseMessage.NO_HOST_RECORD);
            }

            // Use the property code for filtering
            const hostId = host.id;
            const canBypass = isAdminUser(req.user) || (isHostUser(req.user) && req.user.id === hostId);
            const baseFilter = canBypass
                ? { hostId: hostId }
                : { hostId: hostId, ...approvedVisibilityFilter() };

            // Search is scoped to this host's own properties (extraPropertyFilter),
            // so a property-name match can never leak another host's rooms in.
            const filterQuery = buildAdminRoomFilterQuery(req.query);
            const searchFilter = await buildAdminRoomSearchFilter(req.query.search, { hostId });
            const query = { ...baseFilter, ...filterQuery, ...(searchFilter || {}) };
            // Always excluded here, even for the host/admin "sees everything
            // regardless of status" bypass above — a soft-deleted room should
            // never resurface in a host's own room list. Admin's dedicated
            // view of deleted rooms lives in getAllForAdmin instead.
            query.isDeleted = { $ne: true };

            if (req.query.checkIn && req.query.checkOut) {
                const fullyBookedIds = await computeFullyBookedRoomIds(req.query.checkIn, req.query.checkOut);
                if (fullyBookedIds.length > 0) {
                    query._id = { $nin: fullyBookedIds };
                }
            }

            const totalRooms = await Room.countDocuments(query);
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalRooms
            );

            // Only a genuinely out-of-range page (data exists, but not at this
            // page) is an error — zero total matches (no rooms yet, or a search
            // with no hits) is a normal, valid empty result, not one.
            if (totalRooms > 0 && pagination.page > pagination.pages) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.OUTOF_DATA
                );
            }

            const rooms = totalRooms === 0
                ? []
                : await Room.find(query)
                    .populate([
                        { path: "amenitiesDetail", select: "id name icon iconCodePoint" },
                        { path: "host", select: "id name code avatar" },
                        { path: "featuresDetail", select: "id title subtitle icon iconCodePoint" },
                        { path: "category", select: "id name icon iconCodePoint" },
                    ])
                    .sort(adminSortFor(req.query.sortBy))
                    .skip(skip)
                    .limit(pagination.pageSize);

            pagination.data = await attachPropertyNames(rooms);

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // Backs the host dashboard's "rate your properties" action item. Kept as
    // its own lightweight endpoint (count + a short list) rather than a filter
    // on getByHost, since the dashboard only ever needs a small nudge list,
    // not a full paginated room browser.
    getPendingRating: async (req, res) => {
        try {
            if (!isHostUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const query = { hostId: req.user.id, hostRatingSet: { $ne: true } };
            const count = await Room.countDocuments(query);
            const rooms = count === 0
                ? []
                : await Room.find(query)
                    .select("code title subtitle")
                    .sort({ createdOn: -1 })
                    .limit(50);

            return Response.successResponse(res, res.statusCode, { count, rooms });
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getById: async (req, res) => {
        try {
            const room = await Room.findById(req.params.id)
                .populate([
                    { path: "amenitiesDetail", select: "id name icon iconCodePoint" },
                    { path: "host", select: "id name code avatar bio rating" },
                    { path: "featuresDetail", select: "id title subtitle icon iconCodePoint" },
                    { path: "category", select: "id name icon iconCodePoint" },
                ])
            if (!room) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }
            // A soft-deleted room is 404 for everyone, including the owning
            // host and admin/preview-token bypasses below — unlike an
            // unapproved/deactivated room, there's no live-preview use case
            // for a listing that's been taken down; admin can still see its
            // basic fields via the "Deleted" filter on the admin rooms table.
            if (room.isDeleted) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }
            // A deactivated room (status 0) is hidden from guests the same
            // way an unapproved one is — the owning host/admin (or a preview
            // link) can still open it to see what guests would see once
            // reactivated/republished.
            if (room.reviewStatus !== "approved" || room.status !== 1) {
                const authorized =
                    canViewUnapproved(req.user, room.hostId) ||
                    hasValidPreviewToken(req.query.preview, room.id);
                if (!authorized) {
                    return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
                }
            }

            const payload = await buildRoomDetailPayload(room, req);
            return Response.successResponse(res, res.statusCode, payload);
        } catch (error) {
            return Response.errorResponse(res, 500, error);
        }
    },

    // search: async (req, res) => {
    //     try {
    //         const body = req.body;

    //         const category = body.categoryId ? await Category.findById(body.categoryId) : null;

    //         if (body.categoryId && !category) {
    //             return Response.customResponse(res, 404, ResponseMessage.NO_CATEGORY_RECORD);
    //         }

    //         let query = {};

    //         if (body.categoryId) query.categoryId = body.categoryId;
    //         if (body.country) query['address.country'] = body.country;
    //         if (body.guests) query.guests = body.guests;
    //         if (body.bedroom) query.bedroom = body.bedroom;
    //         if (body.bed) query.bed = body.bed;
    //         if (body.bath) query.bath = body.bath;

    //         if (body.minPrice || body.maxPrice) {
    //             query.price = {};
    //             if (body.minPrice) query.price.$gte = body.minPrice;
    //             if (body.maxPrice) query.price.$lte = body.maxPrice;
    //         }

    //         const totalRooms = await Room.countDocuments(query);

    //         if (totalRooms === 0) {
    //             return res.status(200).json({
    //                 page: 1,
    //                 pages: 0,
    //                 pageSize: 10,
    //                 rows: 0,
    //                 data: []
    //             });
    //         }

    //         const { pagination, skip } = await PaginationUtility.paginationParams(req, totalRooms);

    //         if (pagination.page > pagination.pages) {
    //             return res.status(200).json({
    //                 page: pagination.page,
    //                 pages: pagination.pages,
    //                 pageSize: pagination.pageSize,
    //                 rows: totalPropertyUnits,
    //                 data: []
    //             });
    //         }

    //         pagination.data = await Room.find(query)
    //             .populate([
    //                 { path: "amenitiesDetail", select: "id name icon" },
    //                 { path: "host", select: "id name code avatar bio rating" },
    //                 { path: "featuresDetail", select: "id title subtitle icon" },
    //                 { path: "category", select: "id name icon" },
    //             ])
    //             .select()
    //             .sort({ _id: -1 })
    //             .skip(skip)
    //             .limit(pagination.pageSize);

    //         if (pagination.data.length === 0) {
    //             return res.status(200).json({
    //                 page: pagination.page,
    //                 pages: pagination.pages,
    //                 pageSize: pagination.pageSize,
    //                 rows: totalRooms,
    //                 data: []
    //             });
    //         }

    //         pagination.data = pagination.data.map((item) => ({
    //             ...item.toJSON(),
    //         }));

    //         return Response.paginationResponse(res, res.statusCode, pagination);
    //     } catch (err) {
    //         return Response.errorResponse(res, 500, err.message || err);
    //     }
    // },

    search: async (req, res) => {
        try {
            const body = req.body;

            const category = body.categoryId ? await Category.findById(body.categoryId) : null;

            if (body.categoryId && !category) {
                return Response.customResponse(res, 404, ResponseMessage.NO_CATEGORY_RECORD);
            }

            let query = {};

            if (body.categoryId) query.categoryId = body.categoryId;
            // Powers the guest-facing /host/:code page's property list —
            // same paginated/auto-scroll search endpoint the properties list
            // page already uses, just scoped to one host.
            if (body.hostId) query.hostId = body.hostId;
            if (body.country) query['address.country'] = { $regex: `^${body.country}$`, $options: 'i' };
            if (body.city) query['address.city'] = { $regex: `^${body.city}$`, $options: 'i' };
            if (body.guests) query.guests = { $gte: body.guests };
            if (body.bedroom) query.bedroom = { $gte: body.bedroom };
            if (body.bed) query.bed = { $gte: body.bed };
            if (body.bath) query.bath = { $gte: body.bath };
            if (body.minRating) query.rating = { $gte: Number(body.minRating) };
            // body.currency is the guest's display/comparison currency for
            // in-memory price conversion and sorting (see targetCurrency
            // below) — not a filter on which rooms to return. Only admin
            // list searches may narrow by listing currency.
            if (body.currency && isAdminUser(req.user)) query.currency = body.currency;

            if (isAdminUser(req.user) && body.reviewStatus && body.reviewStatus !== "approved") {
                query.reviewStatus = body.reviewStatus;
            }

            // Computed once, shared by query.$or below and the street-proximity
            // ranking block further down — see buildSearchTextOr/
            // searchTextMatchesKnownPlace for why both need this same signal.
            const hasExplicitGeoFilter = !!(body.country || body.city);

            // Own-catalog recognition first (unchanged) — if it already
            // works today, leave it alone. The GeoNames-backed resolver
            // (geoPlaceResolver_utility) only ever runs as a fallback for a
            // term the catalog doesn't recognize, and only takes over
            // scoping when it resolves cleanly — see that utility's own doc
            // comment for why it's deliberately conservative (must not
            // hijack a search the catalog/keyword path already handles).
            let isRecognizedPlaceSearch = hasExplicitGeoFilter;
            let resolvedPlace = null;
            if (body.searchtext && !isRecognizedPlaceSearch) {
                isRecognizedPlaceSearch = await searchTextMatchesKnownPlace(body.searchtext);
                if (!isRecognizedPlaceSearch) {
                    const geoIndex = await getGeoPlaceIndex();
                    const resolved = resolvePlaceSearch(body.searchtext, geoIndex);
                    // Only a multi-token match (e.g. "Lekki, Lagos", "London,
                    // UK") is confident enough to treat as recognized here —
                    // nobody types a full place description by accident. A
                    // single bare word ("London") is left EXACTLY as if
                    // unrecognized: isRecognizedPlaceSearch stays false, so
                    // it falls through to the full keyword search below
                    // (buildSearchTextOr's unrecognized branch, which
                    // includes address.street) AND never reaches the
                    // street-proximity anchor block further down — both
                    // gate on this same flag. Without this, a single word
                    // can coincidentally collide with real catalog text
                    // elsewhere (e.g. "Osapa London" street, Lagos) in a way
                    // a multi-part description can't, either hiding that
                    // real listing (if narrowly scoped) or, worse, anchoring
                    // a radius search off it and padding in every other
                    // nearby property as a false "alternative".
                    if (resolved.recognized && resolved.tokenCount >= 2) {
                        isRecognizedPlaceSearch = true;
                        resolvedPlace = resolved;
                    }
                }
            }

            if (resolvedPlace) {
                // A resolved place gives an exact canonical country (and
                // city, when resolved that specifically) — scope with AND,
                // not the OR buildSearchTextOr uses for a single raw term,
                // since ORing two different terms (country vs city) here
                // would wrongly match e.g. any Nigerian listing regardless
                // of city. Also uses the CANONICAL spelling, not the raw
                // (possibly misspelled/reordered) search text, so a small
                // typo still matches real listings spelled correctly.
                query['address.country'] = { $regex: `^${escapeRegex(resolvedPlace.country)}$`, $options: 'i' };
                if (resolvedPlace.city) {
                    query['address.city'] = { $regex: escapeRegex(resolvedPlace.city), $options: 'i' };
                }
            } else if (body.searchtext) {
                // When body.country/body.city was already given explicitly
                // (line 1325/1326 above already pinned it as a hard AND
                // filter), searchtext here is a supplementary landmark/name
                // term (e.g. "Ikeja City Mall") alongside a separately
                // resolved country — not itself a country/city value — so it
                // must search title/subtitle/street/city/country, not just
                // country/city again. Passing isRecognizedPlaceSearch=true
                // in that case made buildSearchTextOr's $or only match
                // address.country/city against the landmark text, which can
                // never match anything and always produced zero results.
                // isRecognizedPlaceSearch itself is left untouched — the
                // street-proximity ranking below still needs to know an
                // explicit geo filter was used.
                query.$or = buildSearchTextOr(
                    body.searchtext,
                    isRecognizedPlaceSearch && !hasExplicitGeoFilter
                );
            }

            // minPrice/maxPrice deliberately does NOT become a raw
            // query.price Mongo filter here — rooms are priced in whatever
            // currency their host listed them in (NGN, USD, GBP, ...), so
            // comparing the guest's typed bounds against the stored amount
            // directly would compare unlike units (a $500 room vs a ₦40,000
            // bound). Instead every branch below fetches full price/currency
            // candidates and applies withinPriceRange() after converting each
            // room's price into targetCurrency — see needsPriceConversion.

            // Exclude only fully-booked rooms (quantity-aware)
            if (body.checkIn && body.checkOut) {
                const fullyBookedIds = await computeFullyBookedRoomIds(body.checkIn, body.checkOut);
                if (fullyBookedIds.length > 0) {
                    query._id = { $nin: fullyBookedIds };
                }
            }

            if (!isAdminUser(req.user) || body.reviewStatus === "approved") {
                query = { $and: [query, approvedVisibilityFilter()] };
            }

            // A price range and/or an explicit price sort both need every
            // candidate room's price converted into one common currency
            // before it can be compared — reuses the same cached FX rates
            // /fx/rate itself reads from (see priceConversion_utility). When
            // the guest didn't supply a currency (older clients, or no price
            // filter/sort active at all), DEFAULT_CURRENCY is used as the
            // comparison currency for sort purposes only; withinPriceRange
            // never applies unless minPrice/maxPrice was actually sent.
            const needsPriceConversion = !!(
                body.minPrice || body.maxPrice || body.sortBy === 'price_asc' || body.sortBy === 'price_desc'
            );
            const targetCurrency = isSupportedCurrency(body.currency) ? String(body.currency).toUpperCase() : DEFAULT_CURRENCY;
            let rateMap = null;
            if (needsPriceConversion) {
                const currenciesInScope = await Room.distinct('currency', query);
                rateMap = await buildCurrencyRateMap(currenciesInScope, targetCurrency);
            }
            const withinPriceRange = (room) => roomWithinPriceRange(room, body.minPrice, body.maxPrice);

            // "Near me" — sort by distance instead of the usual randomNumber/
            // price/createdOn options. Distance is computed in-memory (same
            // haversine helper as `getRelated`) rather than via $geoNear,
            // since `location` is stored as plain lat/lng, not a GeoJSON
            // point. Rooms missing coordinates, or farther than
            // MAX_SEARCH_RADIUS_KM, can't be confirmed as actually nearby —
            // they're excluded from "near me" results entirely rather than
            // padded in to fill the page.
            const hasGeo = typeof body.latitude === "number" && typeof body.longitude === "number";

            if (hasGeo) {
                const origin = { latitude: body.latitude, longitude: body.longitude };

                // DB-side bounding-box pre-filter before fetching anything —
                // origin is always valid here since hasGeo already checked
                // body.latitude/longitude are numbers.
                const bbox = boundingBoxForRadius(origin, MAX_SEARCH_RADIUS_KM);
                const boxedQuery = JSON.parse(JSON.stringify(query));
                const boxedInner = Array.isArray(boxedQuery.$and) ? boxedQuery.$and[0] : boxedQuery;
                boxedInner['location.latitude'] = { $gte: bbox.minLat, $lte: bbox.maxLat };
                boxedInner['location.longitude'] = { $gte: bbox.minLon, $lte: bbox.maxLon };

                // Lean, unpopulated candidate fetch — just enough to compute
                // distance and work out final ordering. Populate only runs
                // once below, on the page actually being returned. price/
                // currency/title/createdOn are only needed when an explicit
                // sort or price range overrides the default distance ordering
                // (see sortComparatorFor/withinPriceRange).
                const candidates = await Room.find(boxedQuery).select('_id location price currency title createdOn').lean();
                if (needsPriceConversion) annotateConvertedPrice(candidates, rateMap);

                const withDistance = [];
                for (const room of candidates) {
                    if (!withinPriceRange(room)) continue;
                    const distanceKm = haversineKm(origin, room.location);
                    if (distanceKm != null && distanceKm <= MAX_SEARCH_RADIUS_KM) {
                        withDistance.push({ id: room._id, distanceKm, price: room.price, priceConverted: room.priceConverted, title: room.title, createdOn: room.createdOn });
                    }
                }
                // "Near me" defaults to closest-first, but an explicit sort pick
                // (price/title/date) still applies within the same radius filter
                // instead of being silently ignored.
                const nearSortComparator = sortComparatorFor(body.sortBy);
                withDistance.sort(nearSortComparator ?? ((a, b) => a.distanceKm - b.distanceKm));

                const orderedRoomIds = withDistance.map((item) => item.id.toString());
                return respondWithPropertyPage(req, res, orderedRoomIds);
            }

            // Two-tier street-proximity ranking: when a searchtext is present,
            // properties whose address.street matches appear first (Rank 1),
            // followed by all other results sorted by distance from the first
            // Rank 1 property's coordinates (Rank 2). A street match that's
            // fully booked for the searched dates still anchors Rank 2 (see
            // anchorCandidates below) rather than dropping the search entirely.
            // Falls through to the normal paginated sort when no street match
            // exists at all (e.g. city searches where the searchtext isn't
            // found in any street field).
            //
            // Gated on isRecognizedPlaceSearch: without it, an unrecognized
            // term (no explicit country/city, and no catalog country/city
            // match either) could still anchor this off a coincidental
            // street/title substring hit — e.g. a Lagos listing on "Osapa
            // London" street matching a bare "London" search — and then pad
            // in every OTHER nearby Lagos property as a "Rank 2 alternative",
            // turning one coincidental match into dozens of unrelated ones.
            // An unrecognized term still reaches the plain keyword search
            // below (via buildSearchTextOr's fullOr), just without this
            // radius-padding amplification.
            if (body.searchtext && isRecognizedPlaceSearch) {
                // A resolved place's raw searchtext may be typo'd or
                // reordered (e.g. "Leki, Lagos", "Lagos, Lekki") — use the
                // canonical name it resolved to, or this would never match
                // any real address.street value.
                const streetSearchTerm = resolvedPlace?.city || resolvedPlace?.region || body.searchtext;
                const streetRegex = new RegExp(streetSearchTerm, 'i');

                // Strip the searchtext $or from a cloned query to get a base that
                // matches all other active filters (dates, guests, price, etc.)
                // without restricting to the searched term. query may be wrapped as
                // { $and: [inner, approvedFilter] } or be a flat object.
                const baseQuery = JSON.parse(JSON.stringify(query));
                const baseInner = Array.isArray(baseQuery.$and) ? baseQuery.$and[0] : baseQuery;
                delete baseInner.$or;

                // Rank 1: properties whose street field directly contains the search term.
                const rank1Query = JSON.parse(JSON.stringify(baseQuery));
                const rank1Inner = Array.isArray(rank1Query.$and) ? rank1Query.$and[0] : rank1Query;
                rank1Inner['address.street'] = streetRegex;

                // Lean, unpopulated fetch — location is needed as the Rank 2
                // anchor point, not for display. Rank 1 itself is never
                // distance-filtered: a direct street-text match stands on
                // its own regardless of coordinates. price/currency/title/
                // createdOn are only needed when an explicit sort or price
                // range overrides the default rank1-then-distance ordering
                // (see sortComparatorFor/withinPriceRange).
                const rank1Candidates = await Room.find(rank1Query).select('_id location price currency title createdOn').lean();
                if (needsPriceConversion) annotateConvertedPrice(rank1Candidates, rateMap);

                // If the street match came back empty only because the fully-booked
                // exclusion removed it (the property exists but can't be booked for
                // these dates), look it up again without that exclusion so its
                // coordinates can still anchor a Rank 2 nearby-alternatives search
                // instead of the whole search falling through to 0 results.
                let anchorCandidates = rank1Candidates;
                const bookingExclusionActive = !!(baseInner._id && baseInner._id.$nin && baseInner._id.$nin.length);
                if (rank1Candidates.length === 0 && bookingExclusionActive) {
                    const anchorQuery = JSON.parse(JSON.stringify(baseQuery));
                    const anchorInner = Array.isArray(anchorQuery.$and) ? anchorQuery.$and[0] : anchorQuery;
                    delete anchorInner._id;
                    anchorInner['address.street'] = streetRegex;
                    anchorCandidates = await Room.find(anchorQuery).select('_id location price title createdOn').lean();
                }

                if (anchorCandidates.length > 0) {
                    const anchor = anchorCandidates[0].location;
                    const sortComparator = sortComparatorFor(body.sortBy);
                    // A price range applies here too — filtered against the
                    // fetched rank1Candidates, not the emptiness check above
                    // (that check is specifically about booking-exclusion
                    // fallback, unrelated to price).
                    const rank1PriceFiltered = rank1Candidates.filter(withinPriceRange);
                    // Rank 1 (direct street match) still comes first — an explicit
                    // sort only changes the order *within* each rank, it doesn't
                    // let a Rank 2 (nearby, non-matching) property jump ahead of a
                    // direct match.
                    const rank1Sorted = sortComparator
                        ? [...rank1PriceFiltered].sort(sortComparator)
                        : rank1PriceFiltered;
                    // rank1Ids stays booking-filtered — an unavailable anchor should
                    // never appear in the list itself, only lend its location.
                    const rank1Ids = rank1Sorted.map(r => r._id.toString());

                    // A Rank 1 hit isn't guaranteed to have coordinates (a
                    // direct street match can land on a room with no lat/lng,
                    // and document order isn't guaranteed to favor a geo-tagged
                    // one). haversineKm already returns null for every Rank 2
                    // candidate in that case — matching that today, but
                    // short-circuiting here instead of running a doomed query
                    // (and avoiding feeding NaN bounds into Mongo).
                    const anchorHasCoords =
                        typeof anchor?.latitude === "number" && typeof anchor?.longitude === "number";

                    let rank2SortedIds = [];
                    if (anchorHasCoords) {
                        // Rank 2: other properties with base filters (no searchtext),
                        // excluding Rank 1 IDs, within MAX_SEARCH_RADIUS_KM of the
                        // anchor and sorted closest-first. Properties outside the
                        // radius — or with no coordinates to confirm distance — are
                        // dropped rather than padded in, so an unrelated city never
                        // fills out the page just because Rank 1 was thin.
                        const bbox = boundingBoxForRadius(anchor, MAX_SEARCH_RADIUS_KM);
                        const rank2Query = JSON.parse(JSON.stringify(baseQuery));
                        const rank2Inner = Array.isArray(rank2Query.$and) ? rank2Query.$and[0] : rank2Query;
                        if (rank2Inner._id && rank2Inner._id.$nin) {
                            rank2Inner._id.$nin = [...rank2Inner._id.$nin, ...rank1Ids];
                        } else {
                            rank2Inner._id = { $nin: rank1Ids };
                        }
                        rank2Inner['location.latitude'] = { $gte: bbox.minLat, $lte: bbox.maxLat };
                        rank2Inner['location.longitude'] = { $gte: bbox.minLon, $lte: bbox.maxLon };

                        const rank2Candidates = await Room.find(rank2Query).select('_id location price currency title createdOn').lean();
                        if (needsPriceConversion) annotateConvertedPrice(rank2Candidates, rateMap);

                        rank2SortedIds = rank2Candidates
                            .map(r => ({ id: r._id.toString(), dist: haversineKm(anchor, r.location), price: r.price, priceConverted: r.priceConverted, title: r.title, createdOn: r.createdOn }))
                            .filter(x => x.dist != null && x.dist <= MAX_SEARCH_RADIUS_KM && withinPriceRange(x))
                            .sort(sortComparator ?? ((a, b) => a.dist - b.dist))
                            .map(x => x.id);
                    }

                    const orderedRoomIds = [...rank1Ids, ...rank2SortedIds];
                    return respondWithPropertyPage(req, res, orderedRoomIds);
                }
            }

            // price_asc/price_desc are deliberately absent here — they need
            // currency-converted prices, which only exist in memory (see
            // needsPriceConversion below), so they can't be a native Mongo
            // sort spec the way createdOn/title can.
            let sortOptions = null;
            let isTitleSort = false;
            if (body.sortBy === 'createdOn_desc') sortOptions = { createdOn: -1 };
            else if (body.sortBy === 'title_asc') { sortOptions = { title: 1 }; isTitleSort = true; }
            else if (body.sortBy === 'title_desc') { sortOptions = { title: -1 }; isTitleSort = true; }

            const getOrderedRoomIds = async (q) => {
                // A price range and/or an explicit price sort both need every
                // candidate's price converted into targetCurrency first —
                // that comparison can only happen in memory, so this path
                // fetches full candidates and filters/sorts in JS instead of
                // delegating to a native Mongo $match/$sort on the raw
                // (currency-blind) price field.
                if (needsPriceConversion) {
                    const candidates = await Room.find(q).select('_id price currency title createdOn').lean();
                    annotateConvertedPrice(candidates, rateMap);
                    const filtered = candidates.filter(withinPriceRange);
                    const comparator = sortComparatorFor(body.sortBy);
                    if (comparator) {
                        filtered.sort(comparator);
                    } else {
                        const seed = (typeof body.seed === 'string' && body.seed.trim()) || 'default';
                        filtered.sort((a, b) => seededOrderKey(a._id.toString(), seed) - seededOrderKey(b._id.toString(), seed));
                    }
                    return filtered.map((r) => r._id.toString());
                }

                if (sortOptions) {
                    let idQuery = Room.find(q).select('_id').sort(sortOptions);

                    // Case-insensitive A–Z so "apartment" and "Apartment" sort together.
                    if (isTitleSort) {
                        idQuery = idQuery.collation({ locale: 'en', strength: 2 });
                    }

                    const idRows = await idQuery.lean();
                    return idRows.map((r) => r._id.toString());
                }
                // "Relevant" (default) order — same seeded shuffle as getAll,
                // stable across this search's paginated scroll (see seededOrderKey).
                const seed = (typeof body.seed === 'string' && body.seed.trim()) || 'default';
                const idRows = await Room.find(q).select('_id').lean();
                return idRows
                    .map((r) => r._id.toString())
                    .sort((a, b) => seededOrderKey(a, seed) - seededOrderKey(b, seed));
            };

            let orderedRoomIds = await getOrderedRoomIds(query);

            // See buildFallbackSearchOr: a strict search that found nothing gets
            // one retry with per-word matching instead of a hard zero. Only
            // fires when it can't have found anything already, and never for a
            // recognized-place search — so it can only add results, never
            // change or dilute a search that already works.
            if (orderedRoomIds.length === 0 && body.searchtext && !isRecognizedPlaceSearch) {
                const words = tokenizeSearchWords(body.searchtext);
                const fallbackOr = buildFallbackSearchOr(body.searchtext);
                if (fallbackOr.length > 0) {
                    const fallbackQuery = JSON.parse(JSON.stringify(query));
                    const fallbackInner = Array.isArray(fallbackQuery.$and) ? fallbackQuery.$and[0] : fallbackQuery;
                    fallbackInner.$or = fallbackOr;

                    // Ranked by how many of the typed words actually matched — a
                    // 2/2 match outranks a 1/2 match, so a listing that only
                    // coincidentally hit one word doesn't sit level with a real
                    // near-match. Explicit sort (price/title/etc.) still applies,
                    // but only to break ties within the same match-count tier —
                    // mirrors how the street-proximity Rank1/Rank2 block above
                    // already treats an explicit sort as a tie-breaker under its
                    // own ranking, rather than letting it override match quality.
                    const candidates = await Room.find(fallbackQuery)
                        .select('_id title subtitle address price currency createdOn')
                        .lean();
                    if (needsPriceConversion) annotateConvertedPrice(candidates, rateMap);
                    const lowerWords = words.map((w) => w.toLowerCase());
                    const matchCount = (room) => {
                        const haystack = [
                            room.title,
                            room.subtitle,
                            room.address?.street,
                            room.address?.city,
                            room.address?.country,
                        ].filter(Boolean).join(' ').toLowerCase();
                        return lowerWords.reduce((count, w) => count + (haystack.includes(w) ? 1 : 0), 0);
                    };

                    const seed = (typeof body.seed === 'string' && body.seed.trim()) || 'default';
                    const sortComparator = sortComparatorFor(body.sortBy);
                    orderedRoomIds = candidates
                        .filter(withinPriceRange)
                        .map((r) => ({
                            id: r._id.toString(),
                            score: matchCount(r),
                            price: r.price,
                            priceConverted: r.priceConverted,
                            title: r.title,
                            createdOn: r.createdOn,
                        }))
                        .sort((a, b) => {
                            if (b.score !== a.score) return b.score - a.score;
                            if (sortComparator) return sortComparator(a, b);
                            return seededOrderKey(a.id, seed) - seededOrderKey(b.id, seed);
                        })
                        .map((r) => r.id);
                }
            }

            return respondWithPropertyPage(req, res, orderedRoomIds);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    // GET /rooms/price-bounds?currency=<code> — the guest-facing price-range
    // slider's floor/ceil. Deliberately NOT the actual highest room price in
    // the catalog — a single outlier listing would blow the ceiling out and
    // make the slider useless for filtering everything below it. Instead the
    // ceiling is a fixed reference amount (₦500,000, roughly the top of what
    // a normal listing costs) converted into the requested currency and
    // rounded to a "nice" number. The top of the range is meant to read as
    // "₦500,000 and up", same as the old bucket system's "150,000+" tier —
    // the frontend shows a "+" suffix when the slider is dragged to max.
    priceBounds: async (req, res) => {
        try {
            const targetCurrency = isSupportedCurrency(req.query.currency)
                ? String(req.query.currency).toUpperCase()
                : DEFAULT_CURRENCY;

            const rateMap = await buildCurrencyRateMap(["NGN"], targetCurrency);
            const rate = rateMap.NGN;
            if (typeof rate !== "number") {
                return Response.successResponse(res, res.statusCode, { min: 0, max: 0, currency: targetCurrency });
            }

            return Response.successResponse(res, res.statusCode, {
                min: 0,
                max: niceRoundUp(PRICE_BOUNDS_REFERENCE_MAX_NGN * rate),
                currency: targetCurrency,
            });
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getRelated: async (req, res) => {
        try {
            const source = await Room.findById(req.params.id);
            if (!source) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            const limit = Math.min(12, Math.max(1, parseInt(req.query.limit, 10) || 4));

            // Currency and region (country) are preferred hard filters: a
            // candidate priced in a different currency or located in a
            // different country isn't an ideal substitute. But "related
            // properties" must never come back empty, so if the strictest
            // combination yields nothing, progressively relax — country,
            // then currency, then category — until at least one candidate
            // is found (or the catalogue genuinely has nothing else).
            const buildMatchFilters = ({ withCategory, withCurrency, withCountry }) => {
                const filters = [
                    { _id: { $ne: source._id }, status: 1 },
                    approvedVisibilityFilter(),
                ];
                // "Related" means a different property, not just a different
                // room — without this, a property's own other units (already
                // shown in its own "Other rooms at this property" section)
                // pass right through here too, since they have distinct room
                // ids even though they're the same physical listing. Only
                // legacy rooms with no propertyId at all skip this — excluding
                // on `null` would wrongly exclude every other propertyless
                // room from each other.
                if (source.propertyId) {
                    filters.push({ propertyId: { $ne: source.propertyId } });
                }
                if (withCategory) {
                    filters.push({ categoryId: source.categoryId });
                }
                if (withCurrency && source.currency) {
                    filters.push({ currency: source.currency });
                }
                if (withCountry && source.address?.country) {
                    filters.push({ "address.country": source.address.country });
                }
                return filters;
            };

            const relaxationStages = [
                { withCategory: true, withCurrency: true, withCountry: true },
                { withCategory: true, withCurrency: true, withCountry: false },
                { withCategory: true, withCurrency: false, withCountry: false },
                { withCategory: false, withCurrency: false, withCountry: false },
            ];

            let candidates = [];
            for (const stage of relaxationStages) {
                candidates = await Room.find({ $and: buildMatchFilters(stage) }).populate([
                    { path: "amenitiesDetail", select: "id name icon iconCodePoint" },
                    { path: "host", select: "id name code avatar bio rating" },
                    { path: "featuresDetail", select: "id title subtitle icon iconCodePoint" },
                    { path: "category", select: "id name icon iconCodePoint" },
                ]);
                if (candidates.length > 0) {
                    break;
                }
            }

            // Optional: drop candidates fully booked for the requested dates,
            // same overlap math as `search`, scoped to just this candidate set.
            const { checkIn, checkOut } = req.query;
            if (checkIn && checkOut && candidates.length > 0) {
                const candidateIds = candidates.map((c) => c._id);
                const [bookingAgg, blockedAgg] = await Promise.all([
                    Reservation.aggregate([
                        {
                            $match: {
                                roomId: { $in: candidateIds },
                                checkIn: { $lt: new Date(checkOut) },
                                checkOut: { $gt: new Date(checkIn) },
                                status: { $nin: ["Cancelled", "Checked Out"] },
                            },
                        },
                        { $group: { _id: "$roomId", bookedUnits: { $sum: { $ifNull: ["$quantity", 1] } } } },
                    ]),
                    BlockedDate.aggregate([
                        {
                            $match: {
                                roomId: { $in: candidateIds },
                                startDate: { $lt: new Date(checkOut) },
                                endDate: { $gt: new Date(checkIn) },
                            },
                        },
                        { $group: { _id: "$roomId", blockedUnits: { $sum: { $ifNull: ["$quantity", 1] } } } },
                    ]),
                ]);
                const unitsByRoom = new Map();
                for (const b of bookingAgg) unitsByRoom.set(b._id.toString(), b.bookedUnits);
                for (const b of blockedAgg) {
                    const key = b._id.toString();
                    unitsByRoom.set(key, (unitsByRoom.get(key) || 0) + b.blockedUnits);
                }
                // Availability is a soft preference, not a hard guarantee —
                // if every candidate is booked out, show them anyway rather
                // than returning an empty related list.
                const availableOnly = candidates.filter(
                    (c) => (unitsByRoom.get(c._id.toString()) || 0) < (c.quantity || 1)
                );
                if (availableOnly.length > 0) {
                    candidates = availableOnly;
                }
            }

            const sourceAmenityIds = amenityIdsOf(source);

            const scored = candidates.map((room) => ({
                room,
                score: relatedScoreOf(source, room, sourceAmenityIds),
            }));
            scored.sort((a, b) => b.score - a.score);

            // De-prioritize (not exclude) repeat hosts so one host can't crowd
            // out every "related" slot — keeps each host's single best match
            // at full score, demotes the rest.
            const seenHostIds = new Set();
            for (const item of scored) {
                const hostKey = item.room.hostId?.toString();
                if (!hostKey) continue;
                if (seenHostIds.has(hostKey)) {
                    item.score *= 0.7;
                } else {
                    seenHostIds.add(hostKey);
                }
            }
            scored.sort((a, b) => b.score - a.score);

            const data = scored.slice(0, limit).map((item) => item.room.toJSON());

            // Pad with proximity-sorted fallback when scored candidates don't fill all slots.
            if (data.length < limit) {
                const needed = limit - data.length;
                const excludeIds = scored.map((i) => i.room._id.toString());
                excludeIds.push(source._id.toString());

                const fallback = await Room.find({
                    $and: [
                        { _id: { $nin: excludeIds } },
                        { status: 1 },
                        approvedVisibilityFilter(),
                    ],
                }).populate([
                    { path: "amenitiesDetail", select: "id name icon iconCodePoint" },
                    { path: "host", select: "id name code avatar bio rating" },
                    { path: "featuresDetail", select: "id title subtitle icon iconCodePoint" },
                    { path: "category", select: "id name icon iconCodePoint" },
                ]);

                const fallbackSorted = fallback
                    .map((r) => ({ room: r, dist: haversineKm(source.location, r.location) ?? Infinity }))
                    .sort((a, b) => a.dist - b.dist)
                    .slice(0, needed);

                for (const item of fallbackSorted) {
                    data.push(item.room.toJSON());
                }
            }

            return Response.successResponse(res, res.statusCode, data);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    topCities: async (req, res) => {
        try {
            const now = Date.now();
            if (!topCitiesCache || now - topCitiesCachedAt > TOP_CITIES_TTL_MS) {
                const results = await Room.aggregate([
                    {
                        $match: {
                            $and: [
                                { status: 1 },
                                approvedVisibilityFilter(),
                                { 'address.city': { $exists: true, $ne: '' } }
                            ]
                        }
                    },
                    {
                        $group: {
                            _id: { city: '$address.city', country: '$address.country' },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { count: -1 } },
                    { $limit: 5 }
                ]);
                topCitiesCache = results.map(r => ({
                    type: 'location',
                    label: [r._id.city, r._id.country].filter(Boolean).join(', '),
                    city: r._id.city || '',
                    country: r._id.country || ''
                }));
                topCitiesCachedAt = now;
            }
            return res.status(200).json({ data: topCitiesCache });
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    // Top areas/neighbourhoods within a city, ranked by listing count — powers
    // the quick-location-filter buttons' city drill-down.
    topAreas: async (req, res) => {
        try {
            const city = (req.query.city || '').trim();
            const country = (req.query.country || '').trim();
            const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
            const limit = Math.max(1, parseInt(req.query.limit, 10) || 9);

            if (!city) {
                return res.status(200).json({ data: [], hasMore: false });
            }

            const and = [
                { status: 1 },
                approvedVisibilityFilter(),
                { 'address.city': { $regex: `^${city}$`, $options: 'i' } },
            ];
            if (country) {
                and.push({ 'address.country': { $regex: `^${country}$`, $options: 'i' } });
            }

            const rooms = await Room.find({ $and: and }).select('address').lean();

            const counts = new Map();
            for (const r of rooms) {
                const area = extractPrimaryAreaToken(r.address?.street, r.address?.city, r.address?.country);
                if (!area) continue;
                const key = area.toLowerCase();
                const existing = counts.get(key);
                if (existing) existing.count += 1;
                else counts.set(key, { label: area, count: 1, city: r.address?.city || '', country: r.address?.country || '' });
            }

            const sorted = [...counts.values()].sort((a, b) => b.count - a.count);
            const data = sorted.slice(skip, skip + limit);
            const hasMore = skip + limit < sorted.length;

            return res.status(200).json({ data, hasMore });
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    // Top areas/neighbourhoods near a coordinate, ranked by distance (each
    // area's rank key is its closest listing) — powers the quick-location-
    // filter buttons' "Near me" drill-down.
    topAreasNear: async (req, res) => {
        try {
            const latitude = parseFloat(req.query.latitude);
            const longitude = parseFloat(req.query.longitude);
            const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
            const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);

            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                return res.status(200).json({ data: [], hasMore: false });
            }

            const origin = { latitude, longitude };
            const bbox = boundingBoxForRadius(origin, MAX_SEARCH_RADIUS_KM);
            const and = [
                { status: 1 },
                approvedVisibilityFilter(),
                { 'location.latitude': { $gte: bbox.minLat, $lte: bbox.maxLat } },
                { 'location.longitude': { $gte: bbox.minLon, $lte: bbox.maxLon } },
            ];

            const rooms = await Room.find({ $and: and }).select('address location').lean();

            const areas = new Map();
            for (const r of rooms) {
                const distanceKm = haversineKm(origin, r.location);
                if (distanceKm == null || distanceKm > MAX_SEARCH_RADIUS_KM) continue;
                const area = extractPrimaryAreaToken(r.address?.street, r.address?.city, r.address?.country);
                if (!area) continue;
                const key = area.toLowerCase();
                const existing = areas.get(key);
                if (!existing || distanceKm < existing.distanceKm) {
                    // city/country of the closest matching listing — the client
                    // has no city context of its own for a near-me-originated
                    // area (unlike a city drill-down), so it needs this to
                    // then call top-streets for whichever area is clicked.
                    areas.set(key, {
                        label: area,
                        distanceKm,
                        city: r.address?.city || '',
                        country: r.address?.country || '',
                    });
                }
            }

            const sorted = [...areas.values()].sort((a, b) => a.distanceKm - b.distanceKm);
            const data = sorted.slice(skip, skip + limit);
            const hasMore = skip + limit < sorted.length;

            return res.status(200).json({ data, hasMore });
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    // Top streets within a specific city+area, ranked by listing count. Pads
    // with the nearest other areas (excluding this one) when streets alone
    // don't fill the requested page — mirrors the Rank1/Rank2 "closest other
    // results fill the rest of the page" behavior already used in search().
    topStreets: async (req, res) => {
        try {
            const area = (req.query.area || '').trim();
            const city = (req.query.city || '').trim();
            const country = (req.query.country || '').trim();
            const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
            const limit = Math.max(1, parseInt(req.query.limit, 10) || 9);

            if (!area || !city) {
                return res.status(200).json({ data: [], hasMore: false });
            }

            const and = [
                { status: 1 },
                approvedVisibilityFilter(),
                { 'address.city': { $regex: `^${city}$`, $options: 'i' } },
            ];
            if (country) {
                and.push({ 'address.country': { $regex: `^${country}$`, $options: 'i' } });
            }

            const rooms = await Room.find({ $and: and }).select('address location').lean();

            const areaLower = area.toLowerCase();
            const inArea = [];
            let anchor = null;
            for (const r of rooms) {
                const roomArea = extractPrimaryAreaToken(r.address?.street, r.address?.city, r.address?.country);
                if (!roomArea || roomArea.toLowerCase() !== areaLower) continue;
                inArea.push(r);
                if (!anchor && typeof r.location?.latitude === 'number' && typeof r.location?.longitude === 'number') {
                    anchor = r.location;
                }
            }

            const streetCounts = new Map();
            for (const r of inArea) {
                const streetToken = extractStreetToken(r.address?.street);
                // Some listings only have "Neighbourhood, City" with no
                // separate street segment — extractStreetToken would then
                // return the neighbourhood name itself, which is redundant
                // to show as a "street" inside its own area's drill-down.
                if (!streetToken || streetToken.toLowerCase() === areaLower) continue;
                const key = streetToken.toLowerCase();
                const existing = streetCounts.get(key);
                if (existing) existing.count += 1;
                else streetCounts.set(key, { label: streetToken, kind: 'street', count: 1 });
            }

            let items = [...streetCounts.values()].sort((a, b) => b.count - a.count);

            if (items.length < skip + limit && anchor) {
                const bbox = boundingBoxForRadius(anchor, AREA_NEARBY_RADIUS_KM);
                const nearbyAnd = [
                    { status: 1 },
                    approvedVisibilityFilter(),
                    { 'location.latitude': { $gte: bbox.minLat, $lte: bbox.maxLat } },
                    { 'location.longitude': { $gte: bbox.minLon, $lte: bbox.maxLon } },
                ];
                const nearbyRooms = await Room.find({ $and: nearbyAnd }).select('address location').lean();

                const nearbyAreas = new Map();
                for (const r of nearbyRooms) {
                    const distanceKm = haversineKm(anchor, r.location);
                    if (distanceKm == null || distanceKm > AREA_NEARBY_RADIUS_KM) continue;
                    const roomArea = extractPrimaryAreaToken(r.address?.street, r.address?.city, r.address?.country);
                    if (!roomArea || roomArea.toLowerCase() === areaLower) continue;
                    const key = roomArea.toLowerCase();
                    const existing = nearbyAreas.get(key);
                    if (!existing || distanceKm < existing.distanceKm) {
                        nearbyAreas.set(key, {
                            label: roomArea,
                            kind: 'area',
                            distanceKm,
                            city: r.address?.city || '',
                            country: r.address?.country || '',
                        });
                    }
                }

                const sortedNearby = [...nearbyAreas.values()].sort((a, b) => a.distanceKm - b.distanceKm);
                items = [...items, ...sortedNearby];
            }

            const data = items.slice(skip, skip + limit);
            const hasMore = skip + limit < items.length;

            return res.status(200).json({ data, hasMore });
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    // Classifies free-text location search (availability bar / filterbar
    // free-text field) into a city or area context so the quick-location-
    // filters row can jump to the matching view instead of staying put.
    resolveLocation: async (req, res) => {
        try {
            const q = (req.query.q || '').trim();
            if (!q) return res.status(200).json({ level: 'none' });

            const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const containsRegex = { $regex: escaped, $options: 'i' };
            const qLower = q.toLowerCase();

            const candidates = await Room.find({
                $and: [
                    { status: 1 },
                    approvedVisibilityFilter(),
                    { $or: [{ 'address.city': containsRegex }, { 'address.street': containsRegex }] },
                ],
            }).select('address').limit(50).lean();

            for (const r of candidates) {
                if ((r.address?.city || '').toLowerCase() === qLower) {
                    return res.status(200).json({
                        level: 'city',
                        city: r.address.city,
                        country: r.address?.country || '',
                    });
                }
            }

            for (const r of candidates) {
                const area = extractPrimaryAreaToken(r.address?.street, r.address?.city, r.address?.country);
                if (area && area.toLowerCase() === qLower) {
                    return res.status(200).json({
                        level: 'area',
                        area,
                        city: r.address?.city || '',
                        country: r.address?.country || '',
                    });
                }
            }

            for (const r of candidates) {
                const street = extractStreetToken(r.address?.street);
                if (street && street.toLowerCase() === qLower) {
                    const area = extractPrimaryAreaToken(r.address?.street, r.address?.city, r.address?.country);
                    return res.status(200).json({
                        level: 'area',
                        area: area || street,
                        city: r.address?.city || '',
                        country: r.address?.country || '',
                    });
                }
            }

            return res.status(200).json({ level: 'none' });
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    suggest: async (req, res) => {
        try {
            const q = (req.query.q || '').trim();
            if (!q) return res.status(200).json({ data: [] });

            const regex = { $regex: q, $options: 'i' };

            const [locationResults, streetMatches, propertyResults, geoIndex] = await Promise.all([
                Room.aggregate([
                    { $match: { $and: [{ status: 1 }, approvedVisibilityFilter(), { $or: [{ 'address.city': regex }, { 'address.country': regex }] }] } },
                    { $group: { _id: { city: '$address.city', country: '$address.country' } } },
                    { $limit: 5 }
                ]),
                Room.aggregate([
                    { $match: { $and: [{ status: 1 }, approvedVisibilityFilter(), { 'address.street': { ...regex, $ne: '' } }] } },
                    { $group: { _id: '$address.street' } },
                    { $limit: 20 }
                ]),
                // Matches on the PROPERTY's own name (not each Room's title,
                // which is often just a generic room-type label like
                // "Standard Room" or "Deluxe Room" — collides constantly
                // across unrelated properties and gave every match an
                // identical, undistinguishable label). One result per
                // property id, with city attached, so two same-named
                // properties in different places no longer render as
                // indistinguishable duplicate entries in the dropdown. Only
                // properties with at least one currently-visible room are
                // offered — a property whose rooms are all pending/rejected/
                // deleted shouldn't be suggestible to a guest.
                RoomProperty.aggregate([
                    { $match: { name: regex } },
                    {
                        $lookup: {
                            from: 'rooms',
                            let: { propertyId: '$_id' },
                            pipeline: [
                                { $match: { $expr: { $eq: ['$propertyId', '$$propertyId'] }, status: 1, ...approvedVisibilityFilter() } },
                                { $limit: 1 },
                            ],
                            as: 'visibleRoom',
                        },
                    },
                    { $match: { 'visibleRoom.0': { $exists: true } } },
                    { $project: { name: 1, city: '$address.city', country: '$address.country' } },
                    { $limit: 3 },
                ]),
                // Cheap in-memory classifier (no extra DB round trip — the
                // GeoPlace index is cached after the first load) telling the
                // frontend whether this partial text already looks like a
                // real, well-known place — used only to decide whether
                // Google's or our own suggestions should lead the merged
                // dropdown, never to filter these results themselves.
                getGeoPlaceIndex(),
            ]);
            const isKnownPlace = isKnownPlacePrefix(q, geoIndex);

            // Extract area tokens (parts after index 0, e.g. "Victoria Island") and
            // street tokens (part at index 0 with house number stripped, e.g. "Ozumba Mbadiwe")
            // separately so areas can be shown before streets in the suggestions.
            const qLower = q.toLowerCase();
            const seenTokens = new Set();
            const extractedAreaTokens = [];
            const extractedStreetTokens = [];
            for (const r of streetMatches) {
                const parts = (r._id || '').split(',');
                for (let i = 0; i < parts.length; i++) {
                    let token = parts[i].trim();
                    const isStreetPart = i === 0;
                    if (isStreetPart) token = token.replace(/^\d+\s+/, ''); // strip leading house number
                    if (token.length > 2 && token.toLowerCase().includes(qLower)) {
                        const key = token.toLowerCase();
                        if (!seenTokens.has(key)) {
                            seenTokens.add(key);
                            if (isStreetPart) {
                                extractedStreetTokens.push(token);
                            } else {
                                extractedAreaTokens.push(token);
                            }
                        }
                    }
                }
                if (extractedAreaTokens.length + extractedStreetTokens.length >= 5) break;
            }

            const data = [
                ...locationResults.map(r => ({
                    type: 'location',
                    label: [r._id.city, r._id.country].filter(Boolean).join(', '),
                    city: r._id.city || '',
                    country: r._id.country || ''
                })),
                ...extractedAreaTokens.map(token => ({
                    type: 'location',
                    label: token,
                    city: token,
                    country: ''
                })),
                ...extractedStreetTokens.map(token => ({
                    type: 'location',
                    label: token,
                    city: token,
                    country: ''
                })),
                ...propertyResults.map(r => ({
                    type: 'property',
                    id: String(r._id),
                    label: r.name,
                    city: r.city || '',
                    country: r.country || ''
                }))
            ];

            return res.status(200).json({ data, isKnownPlace });
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    update: async (req, res) => {
        try {
            const body = req.body;

            const room = await Room.findById(body.id);
            const category = await Category.findById(body.categoryId);

            if (!room)
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            if (!category)
                return Response.customResponse(res, 404, ResponseMessage.NO_CATEGORY_RECORD);

            const previousPropertyId = room.propertyId ? room.propertyId.toString() : null;
            if (Object.prototype.hasOwnProperty.call(body, 'propertyId') && body.propertyId && body.propertyId !== previousPropertyId) {
                const newProperty = await RoomProperty.findById(body.propertyId);
                if (!newProperty) {
                    return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
                }
                if (String(newProperty.hostId) !== String(room.hostId)) {
                    return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
                }
                if (!newProperty.categoryId && body.categoryId) {
                    newProperty.categoryId = body.categoryId;
                    await newProperty.save();
                }
                room.propertyId = newProperty.id;
            }

            room.title = body.title || room.title;
            room.subtitle = body.subtitle || room.subtitle;
            room.description = body.description || room.description;
            room.gallery = body.gallery || room.gallery;
            room.location = body.location || room.location;
            room.amenities = body.amenities || room.amenities;
            room.address = body.address || room.address;
            room.price = body.price || room.price;
            if (Object.prototype.hasOwnProperty.call(body, 'youtubeUrl')) {
                const normalized = toYouTubeEmbedUrl(body.youtubeUrl);
                // Allow clearing the field by sending empty string or null
                room.youtubeUrl = normalized || null;
            }
            room.hasRefundableCautionFee = body.hasRefundableCautionFee;
            room.refundableCautionFee = body.refundableCautionFee;
            room.currency = body.currency || room.currency;
            room.guests = body.guests || room.guests;
            room.bedroom = body.bedroom || room.bedroom;
            room.bed = body.bed || room.bed;
            room.bath = body.bath || room.bath;
            if (body.rating !== null && body.rating !== undefined && body.rating !== '') {
                room.rating = body.rating;
                room.hostRatingSet = true;
            }
            room.features = body.features || room.features;
            room.categoryId = body.categoryId || room.categoryId;
            room.status = body.status;
            room.quantity = body.quantity || room.quantity;
            room.updatedOn = DateUtil.currentDate();

            const isResubmission = room.reviewStatus === "rejected";
            if (isResubmission) {
                room.reviewStatus = "pending";
                room.rejectionReason = undefined;
                room.reviewedBy = undefined;
                room.reviewedOn = undefined;
            }

            const updatedRoom = await room.save();

            // Reassigning off a property may have left it empty — clean it
            // up the same way rooms.delete does for a deleted room's property.
            const newPropertyId = room.propertyId ? room.propertyId.toString() : null;
            if (previousPropertyId && previousPropertyId !== newPropertyId) {
                const remaining = await Room.countDocuments({ propertyId: previousPropertyId });
                if (remaining === 0) {
                    await RoomProperty.deleteOne({ _id: previousPropertyId });
                }
            }

            const action = `Updated ${moduleName} - ${room.code}`;
            const person = room.hostId;
            await createActivityLog(moduleName, action, person);

            if (isResubmission) {
                const host = await Host.findById(room.hostId);
                notifyAdminOfSubmission(updatedRoom, host, { isResubmission: true });
            }

            return Response.successResponse(res, res.statusCode, updatedRoom);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // delete: async (req, res) => {
    //     try {
    //         const param = req.params;
    //         const room = await Room.findById(param.id);

    //         if (!room) {
    //             return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
    //         }

    //         await room.deleteOne();

    //         const action = `Deleted ${moduleName}- ${room.code}`;
    //         const person = param.actionBy;
    //         await createActivityLog(moduleName, action, person);

    //         return Response.customResponse(
    //             res,
    //             res.statusCode,
    //             ResponseMessage.SUCCESS_MESSAGE
    //         );
    //     } catch (err) {
    //         return Response.errorResponse(res, 500, err);
    //     }
    // },

    delete: async (req, res) => {
        try {
            // The admin UI asks the host first via GET /:id/property-room-count
            // + this flag, so this only silently cascades for callers that
            // don't pass it — default stays "true" to preserve prior behavior.
            const deleteEmptyProperty = req.query.deleteEmptyProperty !== "false";
            // req.user (from the verified token) is authoritative for role/
            // ownership checks and for who's on record as having deleted it —
            // req.params.actionBy is only a display label, kept for the
            // activity log to avoid changing the route's existing shape.
            const result = await deleteOneRoom(
                req.params.id,
                req.user,
                req.user?.code || req.params.actionBy,
                { deleteEmptyProperty }
            );

            if (!result.ok) {
                const status = result.error === ResponseMessage.ACCESS_DENIED ? 403
                    : result.error === ResponseMessage.NO_RECORD ? 404
                    : 409;
                return Response.customResponse(res, status, result.error);
            }

            return Response.successResponse(res, res.statusCode, {
                action: result.action,
                message: result.message || ResponseMessage.SUCCESS_MESSAGE,
            });
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // GET /rooms/:id/property-room-count — lets the admin UI ask, before the
    // host confirms a deletion, whether this room is the last one left under
    // its property, so it can show the "delete the property too?" prompt
    // instead of just deleting straight to a silent cascade.
    propertyRoomCount: async (req, res) => {
        try {
            const room = await Room.findById(req.params.id);
            if (!room) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }
            if (!room.propertyId) {
                return Response.successResponse(res, res.statusCode, { roomCount: 1 });
            }
            const roomCount = await Room.countDocuments({ propertyId: room.propertyId });
            return Response.successResponse(res, res.statusCode, { roomCount });
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // Mints the token the admin/host "preview" button appends to the public
    // guest-site link, so a pending/rejected listing renders there without
    // the guest endpoint itself trusting "any logged-in user."
    previewLink: async (req, res) => {
        try {
            const room = await Room.findById(req.params.id).select("hostId");

            if (!room) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            if (!canViewUnapproved(req.user, room.hostId)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const token = signPreviewToken(room.id);
            return Response.successResponse(res, res.statusCode, {
                token,
                expiresIn: PREVIEW_TOKEN_TTL,
            });
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getPending: async (req, res) => {
        try {
            const totalRooms = await Room.countDocuments({ reviewStatus: "pending" });
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalRooms
            );

            if (pagination.page > pagination.pages) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.OUTOF_DATA
                );
            }

            pagination.data = await Room.find({ reviewStatus: "pending" })
                .populate([
                    { path: "host", select: "id name code avatar email" },
                    { path: "category", select: "id name icon iconCodePoint" },
                ])
                .sort({ createdOn: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (totalRooms === 0) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.NO_DATA
                );
            }

            pagination.data = pagination.data.map((item) => ({
                ...item.toJSON(),
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    approve: async (req, res) => {
        try {
            // Was reachable by any authenticated user, including the host who
            // submitted the listing — a host could PATCH their own pending
            // room straight to "approved" and skip admin review entirely.
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const result = await approveOneRoom(req.params.id, req.user?.code);
            if (!result.ok) {
                return Response.customResponse(res, 404, result.error);
            }

            return Response.successResponse(res, res.statusCode, result.room);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    reject: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const reason = req.body.reason;

            if (!reason) {
                return Response.customResponse(res, 400, "Rejection reason is required.");
            }

            const result = await rejectOneRoom(req.params.id, req.user?.code, reason);
            if (!result.ok) {
                return Response.customResponse(res, 404, result.error);
            }

            return Response.successResponse(res, res.statusCode, result.room);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // Post-approval counterpart to approve/reject — see publishOneRoom's
    // comment above for why these are separate actions from reviewStatus's
    // initial approve/reject pair.
    publish: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const notifyHost = req.body?.notifyHost !== false;
            const result = await publishOneRoom(req.params.id, req.user?.code, notifyHost);
            if (!result.ok) {
                return Response.customResponse(res, result.error === ResponseMessage.NO_RECORD ? 404 : 400, result.error);
            }

            return Response.successResponse(res, res.statusCode, result.room);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    unpublish: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const notifyHost = req.body?.notifyHost !== false;
            const result = await unpublishOneRoom(req.params.id, req.user?.code, req.body?.reason, notifyHost);
            if (!result.ok) {
                return Response.customResponse(res, result.error === ResponseMessage.NO_RECORD ? 404 : 400, result.error);
            }

            return Response.successResponse(res, res.statusCode, result.room);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // Applies the same approve/reject/status action to many rooms at once —
    // each room still goes through the exact same single-room logic above
    // (email, activity log, cleanup), just looped. Partial failures (e.g. one
    // id no longer exists) don't abort the batch; they're reported back in
    // `failed` so the caller can show which ones actually went through.
    bulkApprove: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const ids = extractRoomIds(req);
            if (ids.length === 0) {
                return Response.customResponse(res, 400, "No room ids provided.");
            }
            if (ids.length > MAX_BULK_ROOM_IDS) {
                return Response.customResponse(res, 400, `Cannot act on more than ${MAX_BULK_ROOM_IDS} rooms at once.`);
            }

            const results = await Promise.all(ids.map((id) => approveOneRoom(id, req.user?.code)));
            return Response.successResponse(res, res.statusCode, summarizeBulkResults(results));
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    bulkReject: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const ids = extractRoomIds(req);
            const reason = req.body?.reason;
            if (ids.length === 0) {
                return Response.customResponse(res, 400, "No room ids provided.");
            }
            if (!reason) {
                return Response.customResponse(res, 400, "Rejection reason is required.");
            }
            if (ids.length > MAX_BULK_ROOM_IDS) {
                return Response.customResponse(res, 400, `Cannot act on more than ${MAX_BULK_ROOM_IDS} rooms at once.`);
            }

            const results = await Promise.all(ids.map((id) => rejectOneRoom(id, req.user?.code, reason)));
            return Response.successResponse(res, res.statusCode, summarizeBulkResults(results));
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    bulkPublish: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const ids = extractRoomIds(req);
            if (ids.length === 0) {
                return Response.customResponse(res, 400, "No room ids provided.");
            }
            if (ids.length > MAX_BULK_ROOM_IDS) {
                return Response.customResponse(res, 400, `Cannot act on more than ${MAX_BULK_ROOM_IDS} rooms at once.`);
            }

            const notifyHost = req.body?.notifyHost !== false;
            const results = await Promise.all(ids.map((id) => publishOneRoom(id, req.user?.code, notifyHost)));
            return Response.successResponse(res, res.statusCode, summarizeBulkResults(results));
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    bulkUnpublish: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const ids = extractRoomIds(req);
            if (ids.length === 0) {
                return Response.customResponse(res, 400, "No room ids provided.");
            }
            if (ids.length > MAX_BULK_ROOM_IDS) {
                return Response.customResponse(res, 400, `Cannot act on more than ${MAX_BULK_ROOM_IDS} rooms at once.`);
            }

            const notifyHost = req.body?.notifyHost !== false;
            const results = await Promise.all(
                ids.map((id) => unpublishOneRoom(id, req.user?.code, req.body?.reason, notifyHost))
            );
            return Response.successResponse(res, res.statusCode, summarizeBulkResults(results));
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    bulkDelete: async (req, res) => {
        try {
            const ids = extractRoomIds(req);
            if (ids.length === 0) {
                return Response.customResponse(res, 400, "No room ids provided.");
            }
            if (ids.length > MAX_BULK_ROOM_IDS) {
                return Response.customResponse(res, 400, `Cannot act on more than ${MAX_BULK_ROOM_IDS} rooms at once.`);
            }

            const deleteEmptyProperty = req.query.deleteEmptyProperty !== "false";
            const actionByCode = req.user?.code || req.body?.actionBy;
            const results = await Promise.all(
                ids.map((id) => deleteOneRoom(id, req.user, actionByCode, { deleteEmptyProperty }))
            );
            return Response.successResponse(res, res.statusCode, summarizeBulkResults(results));
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // Admin-only: undo a host's soft delete. Room reappears everywhere it
    // was hidden from (guest search, admin/host listings, dashboard counts).
    restore: async (req, res) => {
        try {
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }
            const room = await Room.findById(req.params.id);
            if (!room) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }
            room.isDeleted = false;
            room.updatedOn = DateUtil.currentDate();
            await room.save();
            await createActivityLog(moduleName, `Restored ${moduleName} - ${room.code}`, req.user?.code);
            return Response.successResponse(res, res.statusCode, { id: room.id, reviewStatus: room.reviewStatus });
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // Host-only bulk Activate/Deactivate — the per-room equivalent already
    // exists via the Edit Room form's status checkbox; this just adds the
    // same "select many, one confirmation" convenience the other bulk
    // actions already have. Scoped to rooms the caller actually owns —
    // anyone else's id in the batch fails individually rather than 403ing
    // the whole request, matching every other bulk handler's shape.
    bulkSetStatus: async (req, res) => {
        try {
            if (!isHostUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }
            const ids = extractRoomIds(req);
            if (ids.length === 0) {
                return Response.customResponse(res, 400, "No room ids provided.");
            }
            if (ids.length > MAX_BULK_ROOM_IDS) {
                return Response.customResponse(res, 400, `Cannot act on more than ${MAX_BULK_ROOM_IDS} rooms at once.`);
            }
            const status = req.body?.status === 1 ? 1 : 0;

            const results = await Promise.all(
                ids.map(async (id) => {
                    const room = await Room.findById(id);
                    if (!room) return { id, ok: false, error: ResponseMessage.NO_RECORD };
                    if (String(room.hostId) !== String(req.user.id)) {
                        return { id, ok: false, error: ResponseMessage.ACCESS_DENIED };
                    }
                    room.status = status;
                    room.updatedOn = DateUtil.currentDate();
                    await room.save();
                    return { id, ok: true };
                })
            );
            return Response.successResponse(res, res.statusCode, summarizeBulkResults(results));
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // Single-field counterpart to update() for the "rate your properties"
    // dashboard prompt — that flow only ever needs to set one room's rating,
    // and update() requires re-sending the room's full editable state
    // (including a resolvable categoryId), which the prompt's quick-rate list
    // has no reason to load.
    setRating: async (req, res) => {
        try {
            if (!isHostUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const rating = req.body.rating;
            if (rating === null || rating === undefined || rating === '') {
                return Response.customResponse(res, 400, "Rating is required.");
            }

            const room = await Room.findById(req.params.id);
            if (!room) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }
            if (String(room.hostId) !== String(req.user.id)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            room.rating = rating;
            room.hostRatingSet = true;
            room.updatedOn = DateUtil.currentDate();
            const updatedRoom = await room.save();

            return Response.successResponse(res, res.statusCode, updatedRoom);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    createBlockedDate: async (req, res) => {
        try {
            const room = await Room.findById(req.params.id);
            if (!room) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            const { startDate, endDate, quantity, reason } = req.body;

            if (!startDate || !endDate) {
                return Response.customResponse(res, 400, "startDate and endDate are required.");
            }
            if (new Date(endDate) <= new Date(startDate)) {
                return Response.customResponse(res, 400, "endDate must be after startDate.");
            }

            const roomQuantity = room.quantity || 1;
            const blockQuantity = quantity ? Number(quantity) : roomQuantity;
            if (blockQuantity < 1 || blockQuantity > roomQuantity) {
                return Response.customResponse(res, 400, `quantity must be between 1 and ${roomQuantity}.`);
            }

            const blockedDate = await BlockedDate.create({
                roomId: room.id,
                hostId: room.hostId,
                startDate,
                endDate,
                quantity: blockQuantity,
                reason,
            });

            const action = `Blocked dates on ${moduleName} - ${room.code}`;
            await createActivityLog(moduleName, action, req.user?.code);

            return Response.successResponse(res, 201, blockedDate);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    getBlockedDates: async (req, res) => {
        try {
            const room = await Room.findById(req.params.id);
            if (!room) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            const blockedDates = await BlockedDate.find({ roomId: room.id }).sort({ startDate: 1 });
            return Response.successResponse(res, res.statusCode, blockedDates);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    getReservedDates: async (req, res) => {
        try {
            const room = await Room.findById(req.params.id);
            if (!room) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            const reservations = await Reservation.find({
                roomId: room.id,
                status: { $nin: ['Cancelled', 'Checked Out'] }
            }).select('checkIn checkOut quantity').sort({ checkIn: 1 });
            return Response.successResponse(res, res.statusCode, reservations);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    deleteBlockedDate: async (req, res) => {
        try {
            const room = await Room.findById(req.params.id);
            if (!room) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            const blockedDate = await BlockedDate.findOneAndDelete({
                _id: req.params.blockId,
                roomId: room.id,
            });
            if (!blockedDate) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            return Response.customResponse(res, 200, ResponseMessage.SUCCESS_MESSAGE);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    countAvailableRooms: async (req, res) => {
        try {
            const roomId = req.body.roomId;
            const checkIn = req.body.checkIn;
            const checkOut = req.body.checkOut;

            if (!checkIn || !checkOut) {
                return Response.customResponse(res, 400, "checkIn and checkOut are required.");
            }

            const room = await Room.findById(roomId);
            if (!room) {
                return Response.customResponse(res, 404, "Room not found.");
            }

            const overlapDocs = await Reservation.find({
                roomId: roomId,
                checkIn: { $lt: new Date(checkOut) },
                checkOut: { $gt: new Date(checkIn) },
                status: { $nin: ['Cancelled', 'Checked Out'] }
            }).select('quantity');
            const bookedUnits = overlapDocs.reduce((sum, r) => sum + (r.quantity || 1), 0);

            // Host-blocked dates count against availability the same way a
            // reservation does — no guest attached, same overlap math.
            const blockedDocs = await BlockedDate.find({
                roomId: roomId,
                startDate: { $lt: new Date(checkOut) },
                endDate: { $gt: new Date(checkIn) },
            }).select('quantity');
            const blockedUnits = blockedDocs.reduce((sum, b) => sum + (b.quantity || 1), 0);

            const available = room.quantity - bookedUnits - blockedUnits;

            return res.status(200).json({
                roomId,
                availableRooms: available >= 0 ? available : 0,
                totalQuantity: room.quantity
            });

        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },
}

// Exposed for reuse by propertiesDashboard.js's compare/merge/delete
// tooling, so a property-level delete goes through the exact same
// per-room cleanup (upload folder removal, empty-property cascade,
// activity log) as deleting a room from the Rooms page already does.
module.exports.deleteOneRoom = deleteOneRoom;

// Exposed for focused unit tests only (rooms.searchGeo.test.js) — not part
// of the controller's public route surface.
module.exports._testables = {
    buildSearchTextOr,
    searchTextMatchesKnownPlace,
    buildFallbackSearchOr,
    tokenizeSearchWords,
    buildAdminRoomFilterQuery,
    adminSortFor,
    computeFullyBookedRoomIds,
    extractRoomIds,
    summarizeBulkResults,
    roomWithinPriceRange,
    sortComparatorFor,
};