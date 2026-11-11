const mongoose = require("mongoose");

const hotDealSchema = new mongoose.Schema(
    {
        roomId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Rooms"
        },
        hostId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Host"
        },
        discountPercent: {
            type: Number,
            min: 0,
            max: 100,
            required: true,
        },
        // Only set when the deal was created from a flat amount rather than a
        // percentage — the exact figure the admin entered, never re-derived
        // from discountPercent. This is what pricing math actually uses;
        // discountPercent alone is a rounded-up display label in that case
        // (see controllers/version1/hotDeals.js create and reservation.js).
        discountAmount: {
            type: Number,
            min: 0,
        },
        endDate: {
            type: Date,
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

hotDealSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

hotDealSchema.virtual("room", {
    ref: "Rooms",
    localField: "roomId",
    foreignField: "_id",
    justOne: true,
});

hotDealSchema.virtual("host", {
    ref: "Host",
    localField: "hostId",
    foreignField: "_id",
    justOne: true,
});

module.exports = mongoose.model("HotDeals", hotDealSchema);
