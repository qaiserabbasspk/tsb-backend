const mongoose = require("mongoose");

const reservationsSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Host"
        },
        isSignedIn: {
            type: Number,
        },
        customerName: {
            type: String
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
        customerCountry: { type: String },
        hostId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Host"
        },
        roomId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Rooms"
        },
        checkIn: {
            type: Date,
        },
        checkOut: {
            type: Date,
        },
        code: { type: String },
        paymentStatus: { type: String },
        status: { type: String },
        message: { type: String },
        quantity: { type: Number, default: 1 },
        // Snapshot of the room's nightly rate and any hot-deal discount at the
        // moment of booking — room.price and the deal itself can both change
        // or disappear later, so this is the permanent record of what was
        // actually agreed and charged, independent of that.
        nightlyRate: { type: Number },
        discountPercent: { type: Number, default: 0 },
        totalAmount: { type: Number },
        txRef: { type: String },
        flwTransactionId: { type: String },
        twclid: { type: String },
        gaClientId: { type: String },
        clientIp: { type: String },
        userAgent: { type: String },
        createdOn: { type: Date, immutable: true },
        updatedOn: { type: Date },
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
                delete ret.clientIp;
                delete ret.userAgent;
                delete ret.twclid;
                delete ret.gaClientId;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.userId;
                delete ret.roomId;
                delete ret.hostId;
                delete ret.clientIp;
                delete ret.userAgent;
                delete ret.twclid;
                delete ret.gaClientId;
            },
        },
    }
);

reservationsSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

reservationsSchema.virtual("host", {
    ref: "Host",
    localField: "hostId",
    foreignField: "_id",
    justOne: true,
});

reservationsSchema.virtual("user", {
    ref: "Host",
    localField: "userId",
    foreignField: "_id",
    justOne: true,
});

reservationsSchema.virtual("room", {
    ref: "Rooms",
    localField: "roomId",
    foreignField: "_id",
    justOne: true,
});

// Covers the checkIn/checkOut overlap lookup used by search() and
// countAvailableRooms() to find fully-booked rooms.
reservationsSchema.index(
    { roomId: 1, checkIn: 1, checkOut: 1, status: 1 },
    { name: "idx_availability_overlap" }
);

module.exports = mongoose.model("Reservation", reservationsSchema);
