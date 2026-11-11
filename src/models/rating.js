const mongoose = require("mongoose");

const ratingSchema = new mongoose.Schema(
    {
        roomRate: {
            type: Number,
        },
        hostRate: {
            type: Number,
        },
        roomId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Rooms"
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Host"
        },
        hostId: {
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
                delete ret.hostId;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.userId;
                delete ret.roomId;
                delete ret.hostId;
            },
        },
    }
);

ratingSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

ratingSchema.virtual("user", {
    ref: "Host",
    localField: "userId",
    foreignField: "_id",
    justOne: true,
});

ratingSchema.virtual("room", {
    ref: "Rooms",
    localField: "roomId",
    foreignField: "_id",
    justOne: true,
});

ratingSchema.virtual("host", {
    ref: "Host",
    localField: "hostId",
    foreignField: "_id",
    justOne: true,
});

module.exports = mongoose.model("Rating", ratingSchema);
