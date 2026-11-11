const PendingReservationCheckout = require("../models/pendingReservationCheckout");
const DateUtil = require("./date_utility");

const PENDING_CHECKOUT_TTL_MS = 60 * 60 * 1000; // 1 hour — well past any realistic checkout session

/**
 * Validates and stores the booking snapshot a guest is about to pay for.
 * Shared by opayCheckout.js and paymentAttempt.js (Flutterwave) so both
 * providers write the identical shape to the identical collection — see
 * models/pendingReservationCheckout.js. Upserts by txRef so a retried
 * checkout attempt doesn't create a stray duplicate.
 *
 * Returns { ok: true } on success, or { ok: false, message } for a 400 the
 * caller should return as-is — this never throws for a malformed `booking`,
 * only for a genuine DB failure.
 */
async function recordPendingCheckout({ txRef, roomId, paymentProvider, booking, req }) {
    if (!booking || !booking.customerName || !booking.customerEmail || !booking.checkIn || !booking.checkOut) {
        return { ok: false, message: "Booking details are required to start checkout." };
    }

    const now = DateUtil.currentDate();
    await PendingReservationCheckout.findOneAndUpdate(
        { txRef },
        {
            txRef,
            paymentProvider,
            roomId,
            userId: booking.userId ?? null,
            isSignedIn: booking.isSignedIn ?? 0,
            customerName: booking.customerName,
            customerEmail: booking.customerEmail,
            customerPhone: booking.customerPhone || {},
            customerCountry: booking.customerCountry ?? null,
            checkIn: booking.checkIn,
            checkOut: booking.checkOut,
            quantity: booking.quantity || 1,
            message: booking.message || "",
            guestCurrency: booking.guestCurrency ?? null,
            twclid: booking.twclid ?? null,
            gaClientId: booking.gaClientId ?? null,
            clientIp: req.ip,
            userAgent: req.headers["user-agent"],
            createdOn: now,
            expiresAt: new Date(now.getTime() + PENDING_CHECKOUT_TTL_MS),
        },
        { upsert: true, setDefaultsOnInsert: true }
    );

    return { ok: true };
}

module.exports = { recordPendingCheckout };
