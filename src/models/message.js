const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
    {
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Conversation"
        },
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Host"
        },
        receiverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Host"
        },
        text: {
            type: String
        },
        isRead: {
            type: Boolean,
            default: false
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        versionKey: false,
        toObject: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.conversationId;
                delete ret.senderId;
                delete ret.receiverId;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.conversationId;
                delete ret.senderId;
                delete ret.receiverId;
            },
        },
    }
);

messageSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

messageSchema.virtual("conversation", {
    ref: "Conversation",
    localField: "conversationId",
    foreignField: "_id",
    justOne: true,
});

messageSchema.virtual("sender", {
    ref: "Host",
    localField: "senderId",
    foreignField: "_id",
    justOne: true,
});

messageSchema.virtual("receiver", {
    ref: "Host",
    localField: "receiverId",
    foreignField: "_id",
    justOne: true,
});

module.exports = mongoose.model("Message", messageSchema);
