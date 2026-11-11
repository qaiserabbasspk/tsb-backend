const HotDeals = require("../../models/hot-deal");
const Room = require("../../models/rooms");
const { hotDealValidation, hotDealUpdateValidation } = require("../../validations/hot-deal");
const { endOfDayInCountryTimezone } = require("../../utilities/countryTimezone_utility");

// UTILITIES
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");

const activeDealFilter = () => ({
    $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: new Date() } }],
});

const isAdminUser = (user) => typeof user?.code === "string" && user.code.startsWith("AD");

// Deals whose room isn't (yet, or no longer) approved are excluded from the
// public feed entirely — admins manage those from the room's own review
// queue, not the hot-deals list.
const approvedRoomIdsFilter = async () => {
    const ids = await Room.find({
        $or: [{ reviewStatus: "approved" }, { reviewStatus: { $exists: false } }],
    }).distinct("_id");
    return { roomId: { $in: ids } };
};

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;

            const { error } = hotDealValidation(body);

            if (error) {
                return Response.errorResponse(res, 400, error);
            }

            const room = await Room.findById(body.roomId).select("hostId address price");
            if (!room) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            // Hot deals are admin-curated for now — hosts don't yet have a way
            // to apply for one, so only admin can feature a room.
            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            // A flat amount is stored as-is (discountAmount) — that exact figure
            // is what reservation.js actually charges. discountPercent is ALSO
            // computed here, rounded UP, but only ever as a display label
            // (deal badges, the admin list, email/receipt line text); it must
            // never be used to re-derive a price, or the guest would be
            // charged slightly more than the amount the admin intended. The
            // room's own price is the ceiling since a discount can't exceed
            // (or go negative on) what the room actually costs.
            let discountPercent = body.discountPercent;
            let discountAmount;
            if (body.discountAmount !== undefined) {
                if (!room.price || room.price <= 0) {
                    return Response.customResponse(res, 400, "Room has no price set — use a percentage discount instead");
                }
                if (body.discountAmount < 0 || body.discountAmount > room.price) {
                    return Response.customResponse(res, 400, "Discount amount must be between 0 and the room's price");
                }
                discountAmount = body.discountAmount;
                discountPercent = Math.min(100, Math.ceil((body.discountAmount / room.price) * 100));
            }

            const existingHotDeal = await HotDeals.findOne({
                roomId: body.roomId,
                hostId: room.hostId,
                ...activeDealFilter(),
            });

            if (existingHotDeal) {
                return Response.customResponse(res, 409, ResponseMessage.DATA_EXISTS);
            }

            const hotDeal = HotDeals({
                roomId: body.roomId,
                hostId: room.hostId,
                discountPercent,
                discountAmount,
                endDate: body.endDate
                    ? endOfDayInCountryTimezone(body.endDate, room.address?.country)
                    : null,
            });

            const newHotDeal = await hotDeal.save();
            return Response.successResponse(res, res.statusCode, newHotDeal);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    update: async (req, res) => {
        try {
            const body = req.body;

            const { error } = hotDealUpdateValidation(body);

            if (error) {
                return Response.errorResponse(res, 400, error);
            }

            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const hotDeal = await HotDeals.findById(req.params.id);
            if (!hotDeal) {
                return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
            }

            const room = await Room.findById(hotDeal.roomId).select("address price");
            if (!room) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            // Same amount->percent derivation as create — see the comment
            // there for why discountPercent must never be used to re-derive
            // discountAmount.
            let discountPercent = body.discountPercent;
            let discountAmount;
            if (body.discountAmount !== undefined) {
                if (!room.price || room.price <= 0) {
                    return Response.customResponse(res, 400, "Room has no price set — use a percentage discount instead");
                }
                if (body.discountAmount < 0 || body.discountAmount > room.price) {
                    return Response.customResponse(res, 400, "Discount amount must be between 0 and the room's price");
                }
                discountAmount = body.discountAmount;
                discountPercent = Math.min(100, Math.ceil((body.discountAmount / room.price) * 100));
            }

            hotDeal.discountPercent = discountPercent;
            hotDeal.discountAmount = discountAmount;
            hotDeal.endDate = body.endDate
                ? endOfDayInCountryTimezone(body.endDate, room.address?.country)
                : null;

            const updatedHotDeal = await hotDeal.save();
            return Response.successResponse(res, res.statusCode, updatedHotDeal);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
        try {
            const filter = isAdminUser(req.user)
                ? activeDealFilter()
                : { ...activeDealFilter(), ...(await approvedRoomIdsFilter()) };
            const totalHotDeals = await HotDeals.countDocuments(filter);
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalHotDeals
            );

            if (pagination.page > pagination.pages) {
                return res.status(200).json({
                    message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
                });
            }

            pagination.data = await HotDeals.find(filter)
                .populate([
                    { path: "host", select: "id name code avatar" },
                    {
                        path: "room",
                        populate: ([
                            {
                                path: "host",
                                select: "id name code avatar",
                            },
                            {
                                path: "category",
                                select: "id name",
                            },
                        ]),
                    },
                ])
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            pagination.data = pagination.data.map((pagination) => {
                pagination.id = pagination._id.toHexString();
                return pagination;
            });

            if (pagination.length === 0) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.NO_DATA
                );
            }

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getByHost: async (req, res) => {
        try {
            const canBypass = isAdminUser(req.user);
            const filter = canBypass
                ? { hostId: req.params.hostId, ...activeDealFilter() }
                : { hostId: req.params.hostId, ...activeDealFilter(), ...(await approvedRoomIdsFilter()) };
            const totalHotDeals = await HotDeals.countDocuments(filter);
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalHotDeals
            );

            if (pagination.page > pagination.pages) {
                return res.status(200).json({
                    message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
                });
            }

            pagination.data = await HotDeals.find(filter)
                .populate([
                    { path: "host", select: "id name code avatar" },
                    {
                        path: "room",
                        populate: {
                            path: "host",
                            select: "id name code avatar",
                        },
                    },
                ])
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            pagination.data = pagination.data.map((pagination) => {
                pagination.id = pagination._id.toHexString();
                return pagination;
            });

            if (pagination.length === 0) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.NO_DATA
                );
            }

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    delete: async (req, res) => {
        try {
            const hotDeal = await HotDeals.findById(req.params.id);

            if (!hotDeal) {
                return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
            }

            if (!isAdminUser(req.user)) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            await hotDeal.deleteOne();
            return Response.customResponse(
                res,
                res.statusCode,
                ResponseMessage.SUCCESS_MESSAGE
            );
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },
}
