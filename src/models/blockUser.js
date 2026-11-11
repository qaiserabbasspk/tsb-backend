const mongoose = require("mongoose");

const blockUserSchema = new mongoose.Schema(
    {
        blockerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Host"
        },
        targetUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Host"
        },
        createdOn: { type: Date, immutable: true },
    },
    {
        versionKey: false,
        toObject: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.blockerId;
                delete ret.targetUserId;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.blockerId;
                delete ret.targetUserId;
            },
        },
    }
);

blockUserSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

blockUserSchema.virtual("blocker", {
    ref: "Host",
    localField: "blockerId",
    foreignField: "_id",
    justOne: true,
});

blockUserSchema.virtual("targetUser", {
    ref: "Host",
    localField: "targetUserId",
    foreignField: "_id",
    justOne: true,
});

module.exports = mongoose.model("BlockUser", blockUserSchema);
