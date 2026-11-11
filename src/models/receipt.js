const mongoose = require("mongoose");

const receiptSchema = new mongoose.Schema(
    {
        receiptNumber: {
            type: String,
        },
        roomId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Rooms"
        },
        hostId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Host"
        },
        reservationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Reservation"
        },
        customerName: {
            type: String,
        },
        customerEmail: {
            type: String
        },
        customerPhone: {
            code: {
                type: String,
            },
            number: {
                type: Number,
            },
        },
        description: {
            type: String,
        },
        totalAmount: {
            type: Number
        },
        // Pre-discount room total, so the receipt can show "was X, Y% off,
        // paid totalAmount" — both omitted/zero when no deal applied.
        originalAmount: {
            type: Number
        },
        discountPercent: {
            type: Number,
            default: 0
        },
        currency: {
            type: String,
        },
        // Snapshot of the guest-currency conversion actually applied at charge
        // time (sourceCurrency === guestCurrency and rate 1 when no conversion
        // happened) - frozen here, never recomputed from a live rate later, since
        // a receipt is a historical record of what was charged, not a live view.
        sourceCurrency: {
            type: String,
        },
        sourceAmount: {
            type: Number,
        },
        guestCurrency: {
            type: String,
        },
        chargedAmount: {
            type: Number,
        },
        rate: {
            type: Number,
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
                delete ret.reservationId;
                delete ret.roomId;
                delete ret.hostId;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.reservationId;
                delete ret.roomId;
                delete ret.hostId;
            },
        },
    }
);

receiptSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

receiptSchema.virtual("reservation", {
    ref: "Reservation",
    localField: "reservationId",
    foreignField: "_id",
    justOne: true,
});

receiptSchema.virtual("room", {
    ref: "Rooms",
    localField: "roomId",
    foreignField: "_id",
    justOne: true,
});

receiptSchema.virtual("host", {
    ref: "Host",
    localField: "hostId",
    foreignField: "_id",
    justOne: true,
});

module.exports = mongoose.model("Receipt", receiptSchema);
