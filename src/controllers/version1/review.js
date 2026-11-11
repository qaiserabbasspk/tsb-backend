const Review = require("../../models/review");
const Host = require("../../models/hosts");
const Guest = require("../../models/guests");
const Room = require("../../models/rooms");
const Administrator = require("../../models/administrator");
const mongoose = require("mongoose");
const { reviewValidation } = require("../../validations/review");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/qbActivityLog_utility");

const moduleName = `Review`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;

            const { error } = reviewValidation(body);

            if (error) {
                return Response.errorResponse(res, 400, error);
            }

            // Reviewer can be either a Host user or a Guest user
            let user = await Host.findById(body.userId);
            let userType = "Host";
            if (!user) {
                user = await Guest.findById(body.userId);
                userType = "Guest";
            }
            const room = await Room.findById(body.roomId);
            const host = await Host.findById(body.hostId);

            if (!user)
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            if (!room)
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            if (!host)
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            const review = Review({
                review: body.review,
                userId: body.userId,
                userType,
                roomId: body.roomId,
                hostId: body.hostId,
                rating: body.rating ?? undefined,
                createdOn: DateUtil.currentDate(),
            });

            const newReview = await review.save();

            // Recalculate room.rating from average of all rated reviews for this room.
            // Only updates if at least one rated review exists; leaves the manually-set
            // rating untouched when no guest has submitted a star score yet.
            const ratingAgg = await Review.aggregate([
                { $match: { roomId: new mongoose.Types.ObjectId(body.roomId), rating: { $exists: true, $ne: null } } },
                { $group: { _id: null, avg: { $avg: "$rating" } } },
            ]);
            if (ratingAgg.length > 0) {
                const avg = Math.round(ratingAgg[0].avg * 10) / 10;
                await Room.findByIdAndUpdate(body.roomId, { rating: avg });
            }

            const action = `New ${moduleName} - ${newReview.roomId}`;
            const person = body.actionBy;
            await createActivityLog(moduleName, action, person);

            return Response.successResponse(res, res.statusCode, newReview);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
        try {
            const totalReviews = await Review.countDocuments();
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalReviews
            );

            if (pagination.page > pagination.pages) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.OUTOF_DATA
                );
            }

            pagination.data = await Review.find()
                .populate([
                    { path: "user", select: "id name code avatar firstName lastName" },
                    { path: "room", select: "id code title subtitle price" },
                    { path: "host", select: "id name code avatar" },
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

    getById: async (req, res) => {
        try {
            const reservation = await Review.findById(req.params.id)
                .populate([
                    { path: "user", select: "id name code avatar firstName lastName" },
                    { path: "room", select: "id code title subtitle price" },
                    { path: "host", select: "id name code avatar" },
                ])
            if (!reservation) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            return Response.successResponse(res, res.statusCode, reservation);
        } catch (error) {
            return Response.errorResponse(res, 500, error);
        }
    },

    getByHost: async (req, res) => {
        try {
            const host = await Host.findOne({ code: req.params.code });

            if (!host) {
                return Response.customResponse(res, 404, ResponseMessage.NO_HOST_RECORD);
            }

            const hostId = host.id;

            const totalReviews = await Review.countDocuments({ hostId: hostId });
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalReviews
            );

            if (pagination.page > pagination.pages) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.OUTOF_DATA
                );
            }

            pagination.data = await Review.find({ hostId: hostId })
                .populate([
                    { path: "host", select: "id name code avatar" },
                    { path: "user", select: "id name code avatar firstName lastName" },
                    { path: "room", select: "id code title subtitle price" },
                ])
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (totalReviews === 0) {
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

    getByRoom: async (req, res) => {
        try {
            const room = await Room.findOne({ _id: req.params.roomId });

            if (!room) {
                return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
            }

            const totalReviews = await Review.countDocuments({ roomId: req.params.roomId });
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalReviews
            );

            if (pagination.page > pagination.pages) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.OUTOF_DATA
                );
            }

            pagination.data = await Review.find({ roomId: req.params.roomId })
                .populate([
                    { path: "host", select: "id name code avatar" },
                    { path: "user", select: "id name code avatar firstName lastName" },
                    { path: "room", select: "id code title subtitle price" },
                ])
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (totalReviews === 0) {
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

    delete: async (req, res) => {
        try {
            const param = req.params;
            const review = await Review.findById(param.id);

            if (!review) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            // The review's own author may delete it; anyone else needs to be
            // an administrator (moderation).
            const isOwner = String(review.userId) === String(req.user?.id);
            if (!isOwner) {
                const admin = await Administrator.findById(req.user?.id);
                if (!admin) {
                    return Response.customResponse(
                        res,
                        403,
                        "You can only delete your own review."
                    );
                }
            }

            await review.deleteOne();

            const action = `Deleted ${moduleName}- ${review.userId}`;
            const person = param.actionBy;
            await createActivityLog(moduleName, action, person);

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