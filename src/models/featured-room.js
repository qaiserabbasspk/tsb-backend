const mongoose = require("mongoose");

const featuredRoomSchema = new mongoose.Schema(
    {
        roomId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Rooms"
        },
        hostId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Host"
        },
    },
    {
        timestamps: true,
        versionKey: false,
        toObject: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.roomId;
                delete ret.hostId;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.roomId;
                delete ret.hostId;
            },
        },
    }
);

featuredRoomSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

featuredRoomSchema.virtual("room", {
    ref: "Rooms",
    localField: "roomId",
    foreignField: "_id",
    justOne: true,
});

featuredRoomSchema.virtual("host", {
    ref: "Host",
    localField: "hostId",
    foreignField: "_id",
    justOne: true,
});

module.exports = mongoose.model("FeaturedRooms", featuredRoomSchema);
