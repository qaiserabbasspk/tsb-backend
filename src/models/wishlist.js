const mongoose = require("mongoose");

const wishlistSchema = new mongoose.Schema(
    {
        roomId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Rooms"
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Host"
        },
        createdOn: {
            type: Date,
            immutable: true,
        },
    },

    {
        versionKey: false,
        toObject: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.userId;
                delete ret.roomId;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.userId;
                delete ret.roomId;
            },
        },
    }
);

wishlistSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

wishlistSchema.virtual("user", {
    ref: "Host",
    localField: "userId",
    foreignField: "_id",
    justOne: true,
});

wishlistSchema.virtual("room", {
    ref: "Rooms",
    localField: "roomId",
    foreignField: "_id",
    justOne: true,
});

module.exports = mongoose.model("Wishlist", wishlistSchema);
