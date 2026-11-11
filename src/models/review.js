const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
    {
        review: {
            type: String,
        },
        rating: {
            type: Number,
            min: 1,
            max: 5,
        },
        roomId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Rooms"
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            // Reviewer can be a Host or a Guest — refPath below resolves the
            // right collection per-document via userType.
            refPath: "userType",
        },
        userType: {
            type: String,
            enum: ["Host", "Guest"],
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

reviewSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

reviewSchema.virtual("user", {
    ref: (doc) => doc.userType || "Host",
    localField: "userId",
    foreignField: "_id",
    justOne: true,
});

reviewSchema.virtual("room", {
    ref: "Rooms",
    localField: "roomId",
    foreignField: "_id",
    justOne: true,
});

reviewSchema.virtual("host", {
    ref: "Host",
    localField: "hostId",
    foreignField: "_id",
    justOne: true,
});

module.exports = mongoose.model("Review", reviewSchema);
