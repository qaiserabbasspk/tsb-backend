const Message = require("../models/message");
const Conversation = require("../models/conversation");

module.exports = (io) => {
    io.on("connection", (socket) => {
        console.log("New client connected:", socket.id);

        // Join user-specific room
        socket.on("join", (userId) => {
            socket.join(userId);
            console.log(`User ${userId} joined their room`);
        });

        // Handle message send
        socket.on("sendMessage", async (data) => {
            const { senderId, receiverId, text } = data;

            let conversation = await Conversation.findOne({
                $or: [
                    { userId: senderId, hostId: receiverId },
                    { userId: receiverId, hostId: senderId }
                ]
            });

            if (!conversation) {
                conversation = await Conversation.create({
                    userId: senderId,
                    hostId: receiverId,
                    lastMessage: text
                });
            } else {
                conversation.lastMessage = text;
                conversation.updatedAt = new Date();
                await conversation.save();
            }

            const message = await Message.create({
                conversationId: conversation._id,
                senderId,
                receiverId,
                text
            });

            // Emit message to receiver
            io.to(receiverId.toString()).emit("receiveMessage", {
                conversationId: conversation._id,
                senderId,
                receiverId,
                text,
                createdAt: message.createdAt
            });

            // Optional: also emit to sender to update their chat UI
            io.to(senderId.toString()).emit("messageSent", message);
        });

        socket.on("disconnect", () => {
            console.log("Client disconnected:", socket.id);
        });
    });

    io.on("markAsRead", async ({ conversationId, userId }) => {
        await Message.updateMany(
            {
                conversationId,
                receiverId: userId,
                isRead: false
            },
            { $set: { isRead: true } }
        );

        // Notify sender that messages were read
        io.to(userId.toString()).emit("messagesRead", { conversationId });
    });

};
