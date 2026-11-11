const Message = require("../../models/message");
const Conversation = require("../../models/conversation");
const mongoose = require("mongoose");
const { messageValidation } = require("../../validations/message");
const leoProfanity = require('leo-profanity');

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const unique = require("../../utilities/codegenerator_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");

const moduleName = `Message`;
leoProfanity.loadDictionary();

module.exports = {
    getMessages: async (req, res) => {
        try {
            const { conversationId } = req.params;
            const totalMessages = await Message.countDocuments(
                { conversationId }
            );
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalMessages
            );

            if (pagination.page > pagination.pages) {
                return res.status(200).json({
                    message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
                });
            }
            pagination.data = await Message.find({ conversationId })
                .populate([
                    { path: "sender", select: "id name code avatar" },
                    { path: "receiver", select: "id name code avatar" },
                ])
                .select()
                .sort({ createdAt: -1 })
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

            pagination.data = pagination.data.map((item) => ({
                ...item.toJSON(),
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);





            // const messages = await Message.find({ conversationId }).sort({ createdAt: 1 });
            // return res.status(200).json(messages);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },

    sendMessage: async (req, res) => {
        try {
            const { senderId, receiverId, text } = req.body;

            const { error } = messageValidation(req.body);

            if (error) {
                return Response.sendValidationErrorMessage(res, 400, error);
            }

            // Check for bad words
            if (leoProfanity.check(text)) {
                return res.status(400).json({
                    error: 'Message contains inappropriate content.',
                });
            }

            let conversation = await Conversation.findOne({
                $or: [
                    { userId: senderId, hostId: receiverId },
                    { userId: receiverId, hostId: senderId }
                ]
            });

            if (!conversation) {
                conversation = await Conversation.create({ userId: senderId, hostId: receiverId });
            }

            const message = await Message.create({
                conversationId: conversation._id,
                senderId,
                receiverId,
                text
            });

            conversation.lastMessage = text;
            conversation.updatedAt = new Date();
            await conversation.save();

            return res.status(201).json({ message, conversationId: conversation._id });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },

    markMessagesAsRead: async (req, res) => {
        try {
            const { conversationId, userId } = req.body;

            await Message.updateMany(
                {
                    conversationId,
                    receiverId: userId,
                    isRead: false
                },
                { $set: { isRead: true } }
            );

            return res.status(200).json({ message: "Messages marked as read" });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },

    getUnreadCounts: async (req, res) => {
        try {
            const { userId } = req.params;

            // 1. Get all conversations for user
            const conversations = await Conversation.find({
                $or: [{ userId }, { hostId: userId }]
            });

            const convoIds = conversations.map(c => c._id);

            // 2. Count unread messages per conversation
            const unreadCounts = await Message.aggregate([
                {
                    $match: {
                        conversationId: { $in: convoIds },
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

            // 3. Format result with lastMessage + updatedAt
            const result = await Promise.all(
                conversations.map(async (c) => {
                    const unread = unreadCounts.find(u => u._id.toString() === c._id.toString()) || { unreadCount: 0 };
                    return {
                        conversationId: c._id,
                        unreadCount: unread.unreadCount,
                        lastMessage: c.lastMessage || "",
                        updatedAt: c.updatedAt
                    };
                })
            );

            return res.status(200).json(result);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }
}
