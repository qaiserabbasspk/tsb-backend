const mongoose = require("mongoose");

const reservationUpdateRequestSchema = new mongoose.Schema(
    {
        reservationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Reservation"
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Host"
        },
        hostId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Host"
        },
        checkIn: {
            type: Date,
        },
        checkOut: {
            type: Date,
        },
        status: { type: String },
        message: { type: String },
        createdOn: { type: Date, immutable: true },
        updatedOn: { type: Date },
    },
    {
        versionKey: false,
        toObject: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.reservationId;
                delete ret.userId;
                delete ret.hostId;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.reservationId;
                delete ret.userId;
                delete ret.hostId;
            },
        },
    }
);

reservationUpdateRequestSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

reservationUpdateRequestSchema.virtual("reservation", {
    ref: "Reservation",
    localField: "reservationId",
    foreignField: "_id",
    justOne: true,
});

reservationUpdateRequestSchema.virtual("host", {
    ref: "Host",
    localField: "hostId",
    foreignField: "_id",
    justOne: true,
});

reservationUpdateRequestSchema.virtual("user", {
    ref: "Host",
    localField: "userId",
    foreignField: "_id",
    justOne: true,
});

module.exports = mongoose.model("ReservationUpdateRequest", reservationUpdateRequestSchema);
