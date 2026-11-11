const FeaturedRooms = require("../../models/featured-room");
const { featuredRoomsValidation } = require("../../validations/featured-room");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/qbActivityLog_utility");

const moduleName = `Featured Room`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;

            const { error } = featuredRoomsValidation(body);

            if (error) {
                return Response.errorResponse(res, 400, error);
            }

            const existingFeaturedRoom = await FeaturedRooms.findOne({
                roomId: body.roomId,
                hostId: body.hostId
            });

            if (existingFeaturedRoom) {
                return Response.customResponse(res, 409, ResponseMessage.DATA_EXISTS);
            }

            const featuredRoom = FeaturedRooms({
                roomId: body.roomId,
                hostId: body.hostId
            });

            const newFeaturedRoom = await featuredRoom.save();
            return Response.successResponse(res, res.statusCode, newFeaturedRoom);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
        try {
            const totalFeaturedRooms = await FeaturedRooms.countDocuments();
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalFeaturedRooms
            );

            if (pagination.page > pagination.pages) {
                return res.status(200).json({
                    message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
                });
            }

            pagination.data = await FeaturedRooms.find()
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
            const totalFeaturedRooms = await FeaturedRooms.countDocuments({ hostId: req.params.hostId });
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalFeaturedRooms
            );

            if (pagination.page > pagination.pages) {
                return res.status(200).json({
                    message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
                });
            }

            pagination.data = await FeaturedRooms.find({ hostId: req.params.hostId })
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
            const featuredRoom = await FeaturedRooms.findById(req.params.id);

            if (!featuredRoom) {
                return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
            }

            await featuredRoom.deleteOne();
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