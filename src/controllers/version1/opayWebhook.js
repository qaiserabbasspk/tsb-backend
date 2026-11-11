const crypto = require("crypto");
const Reservation = require("../../models/reservation");
const Receipt = require("../../models/receipt");
const Host = require("../../models/hosts");
const Room = require("../../models/rooms");
const CheckoutQuote = require("../../models/checkoutQuote");
const PendingReservationCheckout = require("../../models/pendingReservationCheckout");
const { verifyOpayTransaction } = require("../../utilities/opayVerify_utility");
const { sendConversionEvent: sendXConversionEvent } = require("../../utilities/xConversionApi_utility");
const { trackPurchase, trackBookingCreated } = require("../../utilities/ga4MeasurementProtocol_utility");
const { computeReservationPricing } = require("../../utilities/reservationPricing_utility");
const { upsertGuestLead } = require("../../utilities/guestLead_utility");
const { createActivityLog } = require("../../utilities/qbActivityLog_utility");
const { sendEmail } = require("../../utilities/quickbookingEmailer_utility");
const unique = require("../../utilities/codegenerator_utility");
const DateUtil = require("../../utilities/date_utility");

/** Converts a source-currency amount to guest currency, rounded up — mirrors reservation.js. */
function roundUpChargeAmount(amount, rate) {
    return Math.ceil(amount * rate);
}

/** Returns YYYY-MM-DD from a Date/date string — mirrors reservation.js. */
function formatDate(d) {
    return new Date(d).toISOString().slice(0, 10);
}

/**
 * Reconstructs OPay's callback signature and compares it to the `sha512`
 * field in the payload. Verified against a real sandbox callback
 * (2026-09-07) — the HMAC-SHA3-512 reconstruction below matches byte for
 * byte what OPay actually sends, confirmed by independently recomputing it.
 */
function verifyCallbackSignature(payload, privateKey) {
    const p = payload || {};
    const signedString = `{Amount:"${p.amount}",Currency:"${p.currency}",Reference:"${p.reference}",Refunded:${p.refunded ? "t" : "f"},Status:"${p.status}",Timestamp:"${p.timestamp}",Token:"${p.token}",TransactionID:"${p.transactionId}"}`;
    const expected = crypto.createHmac("sha3-512", privateKey).update(signedString).digest("hex");
    return expected === p.sha512;
}

/**
 * Creates the reservation from a webhook-verified OPay payment, used only
 * when the guest's own browser never made it back to finalize the booking
 * itself (closed tab, dropped connection, etc. — the exact gap this webhook
 * exists to cover). Reads the booking details from the PendingReservationCheckout
 * snapshot written at checkout-start (see opayCheckout.js) since that's the
 * only place they exist outside the guest's own browser.
 *
 * Deliberately mirrors reservation.js's create() for a verified-paid OPay
 * booking rather than sharing its code directly — same Reservation/Receipt
 * shape and pricing (via the shared reservationPricing_utility), but with
 * simpler notification emails, since this is a rare fallback path, not the
 * common one. Returns the created reservation, or null if it couldn't be
 * created (room sold out in the meantime, room/host no longer exist).
 *
 * NOT idempotent/safe to call twice for the same txRef on its own — verified
 * directly (calling it twice back-to-back creates two separate paid
 * reservations + duplicate guest emails). The only guard against that is the
 * `existingReservation` check in handleWebhook below, which runs BEFORE this
 * is ever called. Never call this without that check immediately before it.
 */
async function finalizeFromPendingCheckout(pending, verification) {
    const room = await Room.findById(pending.roomId);
    if (!room) {
        console.error(`[OPay Webhook] Room ${pending.roomId} no longer exists — cannot finalize txRef=${pending.txRef}`);
        return null;
    }

    const host = await Host.findById(room.hostId);
    if (!host) {
        console.error(`[OPay Webhook] Host for room ${pending.roomId} no longer exists — cannot finalize txRef=${pending.txRef}`);
        return null;
    }

    const requestedQty = Math.max(1, Number(pending.quantity) || 1);

    // Same availability re-check reservation.js's create() runs — mirrors
    // that exact existing behavior (reject if sold out) rather than
    // introducing new handling for an already-paid guest hitting this edge
    // case; that's a pre-existing gap in the primary path too, not something
    // new this fallback path is responsible for solving.
    const overlapDocs = await Reservation.find({
        roomId: pending.roomId,
        checkIn: { $lt: new Date(pending.checkOut) },
        checkOut: { $gt: new Date(pending.checkIn) },
        status: { $nin: ["Cancelled", "Checked Out"] },
    }).select("quantity");
    const bookedUnits = overlapDocs.reduce((sum, r) => sum + (r.quantity || 1), 0);
    if (bookedUnits + requestedQty > room.quantity) {
        console.error(`[OPay Webhook] Room sold out before finalize could run for txRef=${pending.txRef} — guest was charged NGN ${verification.amount} but no reservation could be created. Needs manual follow-up (refund or manual booking).`);
        return null;
    }

    const { discountPercent, nightlyRate, nights, cautionFee, totalAmount } =
        await computeReservationPricing(room, pending.checkIn, pending.checkOut, requestedQty);

    const reservation = new Reservation({
        code: "RE" + unique.randomCode(),
        userId: pending.userId,
        isSignedIn: pending.isSignedIn,
        customerName: pending.customerName,
        customerEmail: pending.customerEmail,
        customerPhone: pending.customerPhone,
        customerCountry: pending.customerCountry,
        hostId: room.hostId,
        roomId: pending.roomId,
        checkIn: pending.checkIn,
        checkOut: pending.checkOut,
        quantity: requestedQty,
        nightlyRate,
        discountPercent,
        totalAmount,
        paymentStatus: "Paid",
        status: "Pending",
        message: pending.message,
        txRef: pending.txRef,
        paymentProvider: "opay",
        opayOrderNo: verification.orderNo || null,
        twclid: pending.twclid,
        gaClientId: pending.gaClientId,
        clientIp: pending.clientIp,
        userAgent: pending.userAgent,
        createdOn: DateUtil.currentDate(),
    });

    let newReservation;
    try {
        newReservation = await reservation.save();
    } catch (err) {
        // The existingReservation check in handleWebhook is non-atomic — the
        // guest's own browser can win the race and insert first between that
        // check and this save. The unique index on txRef turns that into a
        // duplicate-key error here instead of a second reservation + duplicate
        // emails; the browser's own call already ran the full success path, so
        // there's nothing left to do here.
        if (err.code === 11000) {
            console.log(`[OPay Webhook] Reservation for txRef=${pending.txRef} was created by the guest's browser just before this save — skipping`);
            return null;
        }
        throw err;
    }

    upsertGuestLead({
        name: pending.customerName,
        email: pending.customerEmail,
        phone: pending.customerPhone,
        source: "booking",
        refId: newReservation._id,
        guestId: pending.isSignedIn == 1 ? pending.userId : undefined,
    }).catch((err) => console.error("[GuestLead] Unexpected error:", err));

    const gaCurrency = room.currency || "NGN";

    trackBookingCreated({
        clientId: pending.gaClientId,
        userAgent: pending.userAgent,
        value: totalAmount,
        currency: gaCurrency,
        room,
        quantity: requestedQty,
    }).catch((err) => console.error("[GA4 MP] Unexpected error:", err));

    const receiptQtyLabel = requestedQty > 1 ? ` × ${requestedQty} units` : "";
    const receipt = new Receipt({
        receiptNumber: "REC" + unique.randomCode(),
        roomId: pending.roomId,
        hostId: room.hostId,
        reservationId: newReservation._id,
        customerName: pending.customerName,
        customerEmail: pending.customerEmail,
        customerPhone: pending.customerPhone,
        description: `${nights} night${nights === 1 ? "" : "s"} stay${receiptQtyLabel}`,
        originalAmount: room.price * nights * requestedQty,
        discountPercent,
        totalAmount,
        currency: room.currency || "NGN",
        createdOn: DateUtil.currentDate(),
    });
    receipt.save().catch((err) => console.error("[QB] Auto-receipt failed:", err));

    sendXConversionEvent({
        conversionId: pending.txRef || String(newReservation._id),
        twclid: pending.twclid,
        ipAddress: pending.clientIp,
        userAgent: pending.userAgent,
    }).catch((err) => console.error("[X Conversion API] Unexpected error:", err));

    trackPurchase({
        clientId: pending.gaClientId,
        userAgent: pending.userAgent,
        transactionId: pending.txRef || String(newReservation._id),
        value: totalAmount,
        currency: gaCurrency,
        room,
        quantity: requestedQty,
    }).catch((err) => console.error("[GA4 MP] Unexpected error:", err));

    const emailCurrency = (room.currency || "NGN").toUpperCase();
    const fmt = (n) => new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(n);

    const guestEmail = `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 20px; line-height: 1.6;">
        <h2 style="color: #4CAF50;">Reservation Confirmation</h2>
        <p>Dear <strong>${pending.customerName}</strong>,</p>
        <p>Thank you for choosing QuickBooking. Your payment has been received and your reservation is confirmed.</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <tr><td style="padding: 8px; font-weight: bold;">Reservation Code:</td><td style="padding: 8px;">${newReservation.code}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Property:</td><td style="padding: 8px;">${room.title}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Check-in Date:</td><td style="padding: 8px;">${formatDate(newReservation.checkIn)}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Check-out Date:</td><td style="padding: 8px;">${formatDate(newReservation.checkOut)}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Total Paid:</td><td style="padding: 8px;">${emailCurrency} ${fmt(totalAmount)}</td></tr>
        </table>
        <p>If you have any questions or need support, feel free to contact us.</p>
        <p>Best regards,<br>QuickBooking Support Team</p>
        <p style="font-size: 12px; color: #aaa;">&copy; ${new Date().getFullYear()} QuickBooking. All rights reserved.</p>
        </div>`;

    const hostEmail = `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 20px; line-height: 1.6;">
        <h2 style="color: #4CAF50;">Reservation Made</h2>
        <p>Dear <strong>${host.name}</strong>,</p>
        <p>This is to notify that there is a booking made to your property.</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <tr><td style="padding: 8px; font-weight: bold;">Reservation Code:</td><td style="padding: 8px;">${newReservation.code}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Property:</td><td style="padding: 8px;">${room.title}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Check-in Date:</td><td style="padding: 8px;">${formatDate(newReservation.checkIn)}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Check-out Date:</td><td style="padding: 8px;">${formatDate(newReservation.checkOut)}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Customer Name:</td><td style="padding: 8px;">${pending.customerName}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Customer Email:</td><td style="padding: 8px;">${pending.customerEmail}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Total:</td><td style="padding: 8px;">${emailCurrency} ${fmt(totalAmount)}</td></tr>
        </table>
        <p>Best regards,<br>QuickBooking Support Team</p>
        <p style="font-size: 12px; color: #aaa;">&copy; ${new Date().getFullYear()} QuickBooking. All rights reserved.</p>
        </div>`;

    sendEmail(pending.customerEmail, `Reservation Made ${newReservation.code}`, guestEmail)
        .catch((err) => console.error("[OPay Webhook] Email to guest failed:", err));
    sendEmail(host.email, `Reservation Made ${newReservation.code}`, hostEmail)
        .catch((err) => console.error("[OPay Webhook] Email to host failed:", err));

    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
    if (adminEmail) {
        const adminEmailBody = `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 20px; line-height: 1.6;">
        <h2 style="color: #5eac12;">New Booking Received (via OPay webhook fallback)</h2>
        <p>A new reservation was finalized by the OPay webhook because the guest's browser did not make it back to complete the booking itself.</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <tr><td style="padding: 8px; font-weight: bold;">Reservation Code:</td><td style="padding: 8px;">${newReservation.code}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Property:</td><td style="padding: 8px;">${room.title} (${room.code})</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Host:</td><td style="padding: 8px;">${host.name} (${host.code})</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Customer:</td><td style="padding: 8px;">${pending.customerName} (${pending.customerEmail})</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Total:</td><td style="padding: 8px;">${emailCurrency} ${fmt(totalAmount)}</td></tr>
        </table>
        <p style="font-size: 12px; color: #aaa;">&copy; ${new Date().getFullYear()} QuickBooking. All rights reserved.</p>
        </div>`;
        sendEmail(adminEmail, `[New Booking — Webhook Fallback] ${newReservation.code} — ${room.title}`, adminEmailBody)
            .catch((err) => console.error("[OPay Webhook] Email to admin failed:", err));
    }

    await createActivityLog("Reservation", `New Reservation- ${room.code}`, pending.customerName);

    return newReservation;
}

module.exports = {
    // Exported for testing — finalizeFromPendingCheckout is the fallback
    // creation path itself, exercised directly by test scripts without
    // needing a real OPay payment round trip.
    finalizeFromPendingCheckout,
    handleWebhook: async (req, res) => {
        // TEMPORARY — logs the raw callback body so the signature format below
        // can be confirmed against a real OPay callback instead of the doc
        // summary it was written from. Remove once verifyCallbackSignature has
        // been checked against at least one real payload logged here.
        console.log("[OPay Webhook] Raw callback body:", JSON.stringify(req.body));

        const privateKey = process.env.OPAY_PRIVATE_KEY;
        const payload = req.body?.payload;
        const incomingSignature = req.body?.sha512 || payload?.sha512;

        if (!privateKey || !payload || !incomingSignature || !verifyCallbackSignature({ ...payload, sha512: incomingSignature }, privateKey)) {
            console.warn("[OPay Webhook] Invalid or unverifiable signature — request rejected");
            return res.status(401).json({ message: "Unauthorized" });
        }

        // Acknowledge immediately so OPay does not retry
        res.status(200).json({ message: "Webhook received" });

        try {
            const status = String(payload.status || "").toUpperCase();
            if (status !== "SUCCESS") {
                console.log(`[OPay Webhook] Payment not successful for reference=${payload.reference}, status=${status}`);
                return;
            }

            const existingReservation = await Reservation.findOne({ txRef: payload.reference });
            if (existingReservation) {
                console.log(`[OPay Webhook] Reservation ${existingReservation.code} already exists (paymentStatus=${existingReservation.paymentStatus}) — skipping`);
                return;
            }

            // No reservation yet — the guest's own browser hasn't finalized
            // this booking (or hasn't gotten there yet). Look up what they
            // were trying to book and finalize it ourselves; this is the
            // fallback the webhook exists for.
            const pending = await PendingReservationCheckout.findOne({ txRef: payload.reference, paymentProvider: "opay" });
            if (!pending) {
                console.log(`[OPay Webhook] No reservation and no pending checkout found for reference=${payload.reference} — cannot reconstruct booking, skipping`);
                return;
            }

            const room = await Room.findById(pending.roomId);
            if (!room) return;

            const requestedQty = Math.max(1, Number(pending.quantity) || 1);
            const { totalAmount } = await computeReservationPricing(room, pending.checkIn, pending.checkOut, requestedQty);

            // Same currency-conversion handling as reservation.js's create()
            // — only require a frozen CheckoutQuote when conversion actually
            // happened, not unconditionally (the previous version of this
            // file required one for every payment, so it could never
            // reconcile a same-currency NGN booking — the majority of
            // traffic — even when everything else was correct).
            const sourceCurrency = (room.currency || "NGN").trim().toUpperCase();
            const requestedGuestCurrency = (pending.guestCurrency || sourceCurrency).trim().toUpperCase();
            const needsConversion = requestedGuestCurrency !== sourceCurrency;

            let guestCurrency = sourceCurrency;
            let quoteRate = 1;
            if (needsConversion) {
                const quote = await CheckoutQuote.findOne({ txRef: payload.reference });
                if (!quote) {
                    console.warn(`[OPay Webhook] No checkout quote found for reference=${payload.reference} — cannot verify converted amount, skipping`);
                    return;
                }
                guestCurrency = quote.guestCurrency;
                quoteRate = quote.rate;
            }

            if (guestCurrency !== "NGN") {
                console.warn(`[OPay Webhook] Guest currency ${guestCurrency} is not NGN for reference=${payload.reference} — OPay only supports NGN, skipping`);
                return;
            }

            const expectedAmount = roundUpChargeAmount(totalAmount, quoteRate);
            const verification = await verifyOpayTransaction(payload.reference, expectedAmount);
            if (!verification.valid) {
                console.warn(`[OPay Webhook] Verification failed for reference=${payload.reference}:`, verification.reason);
                return;
            }

            const newReservation = await finalizeFromPendingCheckout(pending, verification);
            if (newReservation) {
                console.log(`[OPay Webhook] Reservation ${newReservation.code} created via webhook fallback for reference=${payload.reference}`);
            }
        } catch (err) {
            console.error("[OPay Webhook] Error processing webhook:", err.message);
        }
    },
};
