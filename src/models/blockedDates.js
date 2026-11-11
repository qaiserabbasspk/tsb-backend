const mongoose = require("mongoose");

const blockedDatesSchema = new mongoose.Schema(
    {
        roomId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Rooms",
            required: true,
        },
        hostId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Host",
            required: true,
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
        },
        reason: {
            type: String,
        },
        createdOn: {
            type: Date,
            immutable: true,
            default: Date.now,
        },
    },
    {
        versionKey: false,
        toObject: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
            },
        },
    }
);

blockedDatesSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

// Covers the startDate/endDate overlap lookup used by search() and
// countAvailableRooms() to find fully-booked rooms.
blockedDatesSchema.index(
    { roomId: 1, startDate: 1, endDate: 1 },
    { name: "idx_blocked_overlap" }
);

module.exports = mongoose.model("BlockedDate", blockedDatesSchema);
