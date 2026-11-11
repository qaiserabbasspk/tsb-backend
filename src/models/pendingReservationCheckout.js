const mongoose = require("mongoose");

// A frozen snapshot of the booking a guest was about to PAY for — "checkout"
// here always means the payment checkout attempt (OPay/Flutterwave), never
// the guest's stay checkout date (that's the checkIn/checkOut fields below).
// Captured before the guest ever leaves the site to pay, so if a payment
// provider's webhook arrives before the guest's browser makes it back to
// finalize the booking itself (closed tab, dropped connection, etc.), there
// is still enough information to create the reservation from the webhook
// alone instead of silently doing nothing.
//
// Deliberately NOT a Reservation: nothing here is a real booking yet, and it
// must never be visible in any host/admin reservation view. It only exists
// to survive the guest's own round trip to the payment provider and back.
// Mongo TTL below auto-deletes it — an abandoned checkout attempt just
// disappears, no cleanup job needed.
//
// Shared by both providers (see paymentProvider below) rather than one
// collection per provider, so there is exactly one place this snapshot
// shape is defined. Written by opayCheckout.js / paymentAttempt.js; read by
// opayWebhook.js / flutterwaveWebhook.js once a payment is verified.
const pendingReservationCheckoutSchema = new mongoose.Schema(
    {
        txRef: { type: String, required: true, unique: true },
        paymentProvider: { type: String, enum: ["opay", "flutterwave"], required: true },
        roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Rooms", required: true },
        userId: { type: String, default: null },
        isSignedIn: { type: Number, default: 0 },
        customerName: { type: String, required: true },
        customerEmail: { type: String, required: true },
        customerPhone: {
            code: { type: String },
            number: { type: Number },
        },
        customerCountry: { type: String, default: null },
        checkIn: { type: Date, required: true },
        checkOut: { type: Date, required: true },
        quantity: { type: Number, default: 1 },
        message: { type: String, default: "" },
        guestCurrency: { type: String, default: null },
        twclid: { type: String, default: null },
        gaClientId: { type: String, default: null },
        clientIp: { type: String, default: null },
        userAgent: { type: String, default: null },
        createdOn: { type: Date, required: true, immutable: true },
        // Mongo TTL index below auto-deletes the document at this timestamp.
        expiresAt: { type: Date, required: true },
    },
    { versionKey: false }
);

pendingReservationCheckoutSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PendingReservationCheckout", pendingReservationCheckoutSchema);
