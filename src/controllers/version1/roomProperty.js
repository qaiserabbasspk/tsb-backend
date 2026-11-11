const Room = require("../../models/rooms");
const RoomProperty = require("../../models/roomProperty");

const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { approvedVisibilityFilter, isAdminUser, isHostUser, canViewUnapproved, hasValidPreviewToken } = require("../../utilities/roomVisibility_utility");
const { buildRoomDetailPayload } = require("../../utilities/roomDetailPayload_utility");

const fullRoomPopulateOptions = [
    { path: "amenitiesDetail", select: "id name icon iconCodePoint" },
    { path: "host", select: "id name code avatar bio rating" },
    { path: "featuresDetail", select: "id title subtitle icon iconCodePoint" },
    { path: "category", select: "id name icon iconCodePoint" },
];

// Just enough for the "other rooms at this property" picker list — title,
// price, bed/bath/guest counts, quantity, caution-fee flag, a thumbnail —
// per the Phase 3 UI decision (PROPERTY_ROOM_RESTRUCTURE_DECISIONS.md).
// Deliberately NOT populated with amenities/host/features/category; those
// only matter for whichever room is actually selected.
const OTHER_ROOM_FIELDS =
    "code title subtitle price currency gallery rating quantity guests bedroom bed bath hasRefundableCautionFee refundableCautionFee";

// Resolves { selectedRoom, otherRooms } for an already-loaded RoomProperty
// document. Shared by both the "id is a property" path and the "id is a
// room that belongs to a property" path below.
//
// No property-level content is invented or blended (Phase 3 pivot) —
// `selectedRoom` is exactly the same rich shape `getById` returns for a
// single room, and even the page's map/title are meant to read from
// `selectedRoom`'s own address/title rather than the RoomProperty's.
//
// `guaranteedVisibleRoomId`, when set, is a room the caller has ALREADY
// authorized independently (the legacy-room-id entry path below checks
// canViewUnapproved/hasValidPreviewToken for that exact room before calling
// in here) — it must appear in the list and be selected even if it's
// unapproved and the requester otherwise can't bypass review, or a preview
// link would silently show a different (approved) room instead of the one
// it was actually generated for.
//
// `requestedRoomId` (the plain `?roomId=` query param on a property-id URL)
// is NOT pre-authorized — it only ever picks among rooms already visible
// under the normal review-status rules.
const respondWithPropertyDetail = async (property, req, res, { guaranteedVisibleRoomId, requestedRoomId } = {}) => {
    const canBypassReview =
        isAdminUser(req.user) ||
        (isHostUser(req.user) && !!property.hostId && req.user.id === property.hostId.toString());

    const roomQuery = canBypassReview
        ? { propertyId: property._id }
        : {
              propertyId: property._id,
              ...(guaranteedVisibleRoomId
                  ? { $or: [approvedVisibilityFilter(), { _id: guaranteedVisibleRoomId }] }
                  : approvedVisibilityFilter()),
          };

    const rooms = await Room.find(roomQuery).select(OTHER_ROOM_FIELDS).sort({ price: 1 });
    if (rooms.length === 0) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
    }

    const preferredRoomId = guaranteedVisibleRoomId || requestedRoomId;
    const selectedRoomId = (preferredRoomId && rooms.find((r) => r.id === preferredRoomId)?.id) || rooms[0].id;

    const selectedRoomDoc = await Room.findById(selectedRoomId).populate(fullRoomPopulateOptions);
    const selectedRoom = await buildRoomDetailPayload(selectedRoomDoc, req);
    const otherRooms = rooms.filter((r) => r.id !== selectedRoomId).map((r) => r.toJSON());

    return Response.successResponse(res, res.statusCode, { selectedRoom, otherRooms });
};

// A room created before this restructure (or one whose host account was
// since deleted — see the production data check, 2026-07-30) can still lack
// a propertyId. Rather than error, treat it as its own single-room property
// — it has no siblings, so `otherRooms` is just empty.
const syntheticPropertyDetailForRoom = async (room, req, res) => {
    await room.populate(fullRoomPopulateOptions);
    const selectedRoom = await buildRoomDetailPayload(room, req);

    return Response.successResponse(res, res.statusCode, { selectedRoom, otherRooms: [] });
};

module.exports = {
    // Resolves either a RoomProperty id or a legacy Room id to one unified
    // shape — so old bookmarked/shared room links keep landing on the same
    // unit without a redirect, while new links use the property id directly.
    getDetail: async (req, res) => {
        try {
            const idParam = req.params.id;

            const property = await RoomProperty.findById(idParam);
            if (property) {
                return await respondWithPropertyDetail(property, req, res, { requestedRoomId: req.query.roomId });
            }

            const room = await Room.findById(idParam);
            if (!room) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }
            if (room.reviewStatus !== "approved") {
                const authorized =
                    canViewUnapproved(req.user, room.hostId) ||
                    hasValidPreviewToken(req.query.preview, room.id);
                if (!authorized) {
                    return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
                }
            }

            if (!room.propertyId) {
                return await syntheticPropertyDetailForRoom(room, req, res);
            }

            const roomProperty = await RoomProperty.findById(room.propertyId);
            if (!roomProperty) {
                return await syntheticPropertyDetailForRoom(room, req, res);
            }
            return await respondWithPropertyDetail(roomProperty, req, res, { guaranteedVisibleRoomId: room.id });
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },
};
