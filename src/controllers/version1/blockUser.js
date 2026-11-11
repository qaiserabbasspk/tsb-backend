const BlockUser = require("../../models/blockUser");
const Host = require("../../models/hosts");

// VALIDATIONS
const { blockUserValidation } = require("../../validations/blockUser");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/qbActivityLog_utility");

const moduleName = `Block User`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;

            const { error } = blockUserValidation(body);

            if (error) {
                return Response.errorResponse(res, 400, error);
            }

            const blockedUser = await BlockUser.findOne({ blockerId: body.blockerId, targetUserId: body.targetUserId });
            if (blockedUser)
                return Response.customResponse(res, 404, ResponseMessage.USER_ALREADY_BLOCKED);

            const blocker = await Host.findById(body.blockerId);
            const target = await Host.findById(body.targetUserId);

            if (!blocker || !target)
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            const blockUser = BlockUser({
                blockerId: body.blockerId,
                targetUserId: body.targetUserId,
                createdOn: DateUtil.currentDate(),
            });

            const newBlock = await blockUser.save();
            return Response.successResponse(res, res.statusCode, newBlock);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
        try {
            const totalBlockedUsers = await BlockUser.countDocuments();
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalBlockedUsers
            );

            if (totalBlockedUsers === 0) {
                return Response.customResponse(res, 200, res.statusCode, ResponseMessage.NO_DATA);
            }

            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
            }

            const blockedUsers = await BlockUser.find()
                .populate([
                    { path: "blocker", select: "id name code" },
                    { path: "targetUser", select: "id name code" },
                ])
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (blockedUsers.length === 0) {
                return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            }

            pagination.data = blockedUsers.map((item) => ({
                ...item.toJSON(),
            }));

            pagination.rows = totalBlockedUsers;


            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    delete: async (req, res) => {
        try {
            const param = req.params;
            const blockUser = await BlockUser.findById(param.id);

            if (!blockUser) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            await blockUser.deleteOne();

            return Response.customResponse(
                res,
                res.statusCode,
                ResponseMessage.SUCCESS_MESSAGE
            );
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    checkIfBlocked: async (req, res) => {
        try {
            const body = req.body;
            const { userId, blockerId } = req.body;
            let blockedUser = await BlockUser.findOne({
                $or: [
                    { userId: userId, blockerId: blockerId },
                    { targetUserId: blockerId, blockerId: userId },
                    { targetUserId: userId, blockerId: blockerId },
                ],
            });

            //const blockedUser = await BlockUser.findOne({ blockerId: body.blockerId, targetUserId: body.userId });
            if (blockedUser)
                return Response.customResponse(res, 200, { "isBlocked": true });

            return Response.customResponse(res, 200, { "isBlocked": false });
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    unblock: async (req, res) => {
        try {
            const body = req.body;
            const { userId, blockerId } = req.body;
            let blockedUser = await BlockUser.findOne({
                $or: [
                    { userId: userId, blockerId: blockerId },
                    { targetUserId: blockerId, blockerId: userId },
                    { targetUserId: userId, blockerId: blockerId },
                ],
            });

            if (!blockedUser) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            await blockedUser.deleteOne();

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