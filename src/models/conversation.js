const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Host"
        },
        hostId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Host"
        },
        lastMessage: {
            type: String
        },
        updatedAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true,
        versionKey: false,
        toObject: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.userId;
                delete ret.hostId;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.userId;
                delete ret.hostId;
            },
        },
    }
);

conversationSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

conversationSchema.virtual("host", {
    ref: "Host",
    localField: "hostId",
    foreignField: "_id",
    justOne: true,
});

conversationSchema.virtual("user", {
    ref: "Host",
    localField: "userId",
    foreignField: "_id",
    justOne: true,
});

module.exports = mongoose.model("Conversation", conversationSchema);
