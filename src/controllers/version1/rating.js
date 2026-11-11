const Rating = require("../../models/rating");
const Host = require("../../models/hosts");
const Room = require("../../models/rooms");
const { ratingValidation } = require("../../validations/rating");
const { Types } = require("mongoose");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/qbActivityLog_utility");

const moduleName = `Rating`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;

            const { error } = ratingValidation(body);

            if (error) {
                return Response.errorResponse(res, 400, error);
            }

            const user = await Host.findById(body.userId);
            const room = await Room.findById(body.roomId);
            const host = await Host.findById(body.hostId);

            if (!user)
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            if (!room)
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            if (!host)
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            const rating = Rating({
                roomRate: body.roomRate,
                hostRate: body.hostRate,
                userId: body.userId,
                roomId: body.roomId,
                hostId: body.hostId
            });

            const totalRatings = await Rating.countDocuments({
                roomId: body.roomId,
                hostId: body.hostId
            });

            if (totalRatings == 0) {
                room.rating = body.roomRate;
                host.rating = body.hostRate;
            } else {
                const ratingSums = await Rating.aggregate([
                    {
                        $match: {
                            roomId: new Types.ObjectId(body.roomId),
                            hostId: new Types.ObjectId(body.hostId),
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            totalRoomRate: { $sum: "$roomRate" },
                            totalHostRate: { $sum: "$hostRate" }
                        }
                    }
                ]);

                const totalRoomRate = ratingSums[0]?.totalRoomRate || 0;
                const totalHostRate = ratingSums[0]?.totalHostRate || 0;

                const newRoomRate = (totalRoomRate + body.roomRate) / (totalRatings + 1);
                const newHostRate = (totalHostRate + body.hostRate) / (totalRatings + 1);

                room.rating = newRoomRate.toFixed(1);
                host.rating = newHostRate.toFixed(1);
            }

            const newRating = await rating.save();
            await room.save();
            await host.save();

            const action = `New ${moduleName} - ${newRating.roomId}`;
            const person = body.actionBy;
            await createActivityLog(moduleName, action, person);

            return Response.successResponse(res, res.statusCode, newRating);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },
}