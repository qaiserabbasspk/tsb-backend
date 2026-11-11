const Conversation = require("../../models/conversation");
const Message = require("../../models/message");
const mongoose = require("mongoose");
const { conversationValidation } = require("../../validations/conversation");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const unique = require("../../utilities/codegenerator_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");

const moduleName = `Conversation`;

module.exports = {
    // getConversations: async (req, res) => {
    //     try {
    //         const { userId } = req.params;
    //         const totalConversations = await Conversation.countDocuments(
    //             {
    //                 $or: [{ userId }, { hostId: userId }]
    //             }
    //         );
    //         const { pagination, skip } = await PaginationUtility.paginationParams(
    //             req,
    //             totalConversations
    //         );

    //         if (pagination.page > pagination.pages) {
    //             return res.status(200).json({
    //                 message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
    //             });
    //         }

    //         pagination.data = await Conversation.find({
    //             $or: [{ userId }, { hostId: userId }]
    //         })
    //             .populate([
    //                 { path: "user", select: "id name code avatar" },
    //                 { path: "host", select: "id name code avatar" },
    //             ])
    //             .select()
    //             .sort({ updatedAt: -1 })
    //             .skip(skip)
    //             .limit(pagination.pageSize);

    //         pagination.data = pagination.data.map((pagination) => {
    //             pagination.id = pagination._id.toHexString();
    //             return pagination;
    //         });

    //         if (pagination.length === 0) {
    //             return Response.customResponse(
    //                 res,
    //                 res.statusCode,
    //                 ResponseMessage.NO_DATA
    //             );
    //         }

    //         pagination.data = pagination.data.map((item) => ({
    //             ...item.toJSON(),
    //         }));

    //         return Response.paginationResponse(res, res.statusCode, pagination);





    //         // const conversations = await Conversation.find({
    //         //     $or: [{ userId }, { hostId: userId }]
    //         // }).sort({ updatedAt: -1 });

    //         // return res.status(200).json(conversations);
    //     } catch (err) {
    //         return res.status(500).json({ error: err.message });
    //     }
    // },

    getConversations: async (req, res) => {
        try {
            const { userId } = req.params;

            const totalConversations = await Conversation.countDocuments({
                $or: [{ userId }, { hostId: userId }]
            });

            const { pagination, skip } = await PaginationUtility.paginationParams(req, totalConversations);

            if (pagination.page > pagination.pages) {
                return res.status(200).json({
                    message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
                });
            }

            const conversations = await Conversation.find({
                $or: [{ userId }, { hostId: userId }]
            })
                .populate([
                    { path: "user", select: "id name code avatar" },
                    { path: "host", select: "id name code avatar" },
                ])
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            const conversationIds = conversations.map(c => c._id);

            // Aggregate unread counts
            const unreadCounts = await Message.aggregate([
                {
                    $match: {
                        conversationId: { $in: conversationIds },
                        receiverId: new mongoose.Types.ObjectId(userId),
                        isRead: false
                    }
                },
                {
                    $group: {
                        _id: "$conversationId",
                        unreadCount: { $sum: 1 }
                    }
                }
            ]);

            // Attach unreadCount to each conversation
            const dataWithUnread = conversations.map((conversation) => {
                const unread = unreadCounts.find(u => u._id.toString() === conversation._id.toString());
                return {
                    ...conversation.toJSON(),
                    unreadCount: unread ? unread.unreadCount : 0
                };
            });

            pagination.data = dataWithUnread;

            return Response.paginationResponse(res, res.statusCode, pagination);

        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },

    createOrGetConversation: async (req, res) => {
        try {
            //const body = req.body;
            const { userId, hostId } = req.body;

            const { error } = conversationValidation(req.body);

            if (error) {
                return Response.sendValidationErrorMessage(res, 400, error);
            }

            let conversation = await Conversation.findOne({
                $or: [
                    { userId, hostId },
                    { userId: hostId, hostId: userId }
                ]
            });

            if (!conversation) {
                conversation = Conversation({
                    userId: userId,
                    hostId: hostId,
                    //createdOn: DateUtil.currentDate(),
                    updatedOn: DateUtil.currentDate(),
                });
                await conversation.save();
            }

            return res.status(200).json(conversation);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }
}
