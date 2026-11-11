const Reservation = require("../../models/reservation");
const Receipt = require("../../models/receipt");
const Host = require("../../models/hosts");
const Guest = require("../../models/guests");
const Room = require("../../models/rooms");
const CheckoutQuote = require("../../models/checkoutQuote");
const { reservationValidation } = require("../../validations/reservation");

// UTILITIES
const unique = require("../../utilities/codegenerator_utility");
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/qbActivityLog_utility");
const { sendEmail } = require("../../utilities/quickbookingEmailer_utility");
const { verifyFlutterwaveTransaction } = require("../../utilities/flutterwaveVerify_utility");
const { sendConversionEvent: sendXConversionEvent } = require("../../utilities/xConversionApi_utility");
const { trackBookingCreated, trackPurchase } = require("../../utilities/ga4MeasurementProtocol_utility");
const { upsertGuestLead } = require("../../utilities/guestLead_utility");
const { getActiveHotDeal, computeDiscountedNightlyRate } = require("../../utilities/hotDeal_utility");
const { timezoneForCountry } = require("../../utilities/countryTimezone_utility");

/** Returns YYYY-MM-DD from a MongoDB ISODate or date string */
function formatDate(d) {
  return new Date(d).toISOString().slice(0, 10)
}

/** Guest-typed free text (the special-request message) goes straight into an
 *  HTML email — escape it so it can't inject markup/links into what the host
 *  or admin reads. */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Converts a source-currency amount to guest currency, rounded up to a whole number — never a fraction the guest is charged or shown. */
function roundUpChargeAmount(amount, rate) {
  return Math.ceil(amount * rate)
}

function checkoutTimeLabel(checkOutDate, country) {
  const tz = timezoneForCountry(country)
  try {
    const ref = new Date(`${new Date(checkOutDate).toISOString().slice(0, 10)}T00:00:00Z`)
    const tzAbbr = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(ref).find(p => p.type === 'timeZoneName')?.value || ''
    return tzAbbr ? `12:00 PM ${tzAbbr}` : '12:00 PM'
  } catch { return '12:00 PM' }
}

const moduleName = `Reservation`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;
            const uniqueCode = unique.randomCode();
            const { error } = reservationValidation(body);

            if (error) {
                return Response.sendValidationErrorMessage(res, 400, error);
            }


            if (body.isSignedIn == 1 && body.userId) {
                const user = await Guest.findById(body.userId);
                if (!user)
                    return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            const room = await Room.findById(body.roomId);
            if (!room)
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            if (room.reviewStatus !== "approved" || room.status !== 1 || room.isDeleted)
                return Response.customResponse(res, 409, "This listing is not currently available for booking.");

            const host = await Host.findById(room.hostId);
            if (!host)
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            // Looked up server-side, independent of anything the client sent —
            // the discount that's actually charged and receipted is whichever
            // deal is active on the room right now, never a client-supplied
            // number.
            const activeDeal = await getActiveHotDeal(room._id);
            const discountPercent = activeDeal?.discountPercent ?? 0;
            // discountPercent above is stored/displayed as a label only
            // (emails, receipts, the admin list) — the actual charge always
            // goes through computeDiscountedNightlyRate, which prefers an
            // exact discountAmount when the deal was created from one.
            const nightlyRate = computeDiscountedNightlyRate(room.price, activeDeal);
            const nights = Math.max(1, Math.round(
                (new Date(body.checkOut) - new Date(body.checkIn)) / (1000 * 60 * 60 * 24)
            ));

            // Guard against duplicate submissions — Flutterwave fires both inline callback
            // and redirect_url, which can result in two POST /reservation calls for the same payment
            if (body.txRef) {
                const existing = await Reservation.findOne({ txRef: body.txRef }).lean()
                if (existing) {
                    return Response.customResponse(res, 200, "Reservation already processed.", existing)
                }
            }

            // Sum booked units across overlapping reservations (quantity-aware)
            const requestedQty = Math.max(1, Number(body.quantity) || 1);
            const overlapDocs = await Reservation.find({
                roomId: body.roomId,
                checkIn: { $lt: new Date(body.checkOut) },
                checkOut: { $gt: new Date(body.checkIn) },
                status: { $nin: ['Cancelled', 'Checked Out'] }
            }).select('quantity');
            const bookedUnits = overlapDocs.reduce((sum, r) => sum + (r.quantity || 1), 0);

            if (bookedUnits + requestedQty > room.quantity) {
                return Response.customResponse(res, 409, "No available rooms for the selected dates.");
            }

            // Guest-currency checkout: the frontend sends the currency it actually
            // charged in. Same-currency bookings (today's entire traffic) are
            // untouched — guestCurrency defaults to the room's own currency and
            // quoteRate stays 1, so expectedAmount/expectedCurrency below compute
            // byte-identical to the pre-conversion behavior.
            const sourceCurrency = (room.currency || 'NGN').trim().toUpperCase()
            const requestedGuestCurrency = (body.guestCurrency || sourceCurrency).trim().toUpperCase()
            const needsConversion = requestedGuestCurrency !== sourceCurrency

            let guestCurrency = sourceCurrency
            let quoteRate = 1

            // Verify payment with Flutterwave before creating a paid reservation
            let verifiedPaid = false
            if (body.isPaid == 1) {
                if (!body.transactionId || !body.txRef) {
                    return Response.customResponse(res, 402, "Payment reference is required to complete a paid booking.")
                }

                if (needsConversion) {
                    // A converted charge must have a matching frozen quote — the
                    // rate used to verify the charge can never be recomputed live,
                    // since it may have moved since checkout was initiated. Missing
                    // or expired quote fails closed rather than trusting the client.
                    const quote = await CheckoutQuote.findOne({ txRef: body.txRef })
                    if (!quote) {
                        return Response.customResponse(res, 402, "Checkout quote has expired or was not found — please try again.")
                    }
                    guestCurrency = quote.guestCurrency
                    quoteRate = quote.rate
                }

                const roomOnlyTotal = nightlyRate * nights * requestedQty
                const expectedAmount = roundUpChargeAmount(roomOnlyTotal, quoteRate)
                const verification = await verifyFlutterwaveTransaction(body.transactionId, body.txRef, expectedAmount, guestCurrency)
                if (!verification.valid) {
                    console.warn('[FLW] Verification failed:', verification.reason)
                    return Response.customResponse(res, 402, `Payment could not be verified: ${verification.reason}`)
                }
                verifiedPaid = true
            }

            const phone = { ...body.customerPhone };

            // Caution fee is refundable and never discounted — only the room
            // rate itself is subject to the hot-deal percentage.
            const cautionFee = room.hasRefundableCautionFee && room.refundableCautionFee
                ? room.refundableCautionFee * requestedQty : 0;
            const totalAmount = nightlyRate * nights * requestedQty + cautionFee;

            // ✅ Proceed to create reservation
            const reservation = new Reservation({
                code: "RE" + uniqueCode,
                userId: body.userId,
                isSignedIn: body.isSignedIn,
                customerName: body.customerName,
                customerEmail: body.customerEmail,
                customerPhone: phone,
                customerCountry: body.customerCountry || null,
                hostId: room.hostId,
                roomId: body.roomId,
                checkIn: body.checkIn,
                checkOut: body.checkOut,
                quantity: requestedQty,
                nightlyRate,
                discountPercent,
                totalAmount,
                paymentStatus: verifiedPaid ? "Paid" : "Not Paid",
                status: "Pending",
                message: body.message,
                txRef: body.txRef || null,
                flwTransactionId: body.transactionId ? String(body.transactionId) : null,
                twclid: body.twclid || null,
                gaClientId: body.gaClientId || null,
                clientIp: req.ip,
                userAgent: req.headers['user-agent'],
                createdOn: DateUtil.currentDate(),
            });

            const newReservation = await reservation.save();

            upsertGuestLead({
                name: body.customerName,
                email: body.customerEmail,
                phone,
                source: "booking",
                refId: newReservation._id,
                guestId: body.isSignedIn == 1 ? body.userId : undefined,
            }).catch((err) => console.error("[GuestLead] Unexpected error:", err));

            const gaValue = totalAmount
            const gaCurrency = room.currency || 'NGN'
            const gaClientId = reservation.gaClientId
            const gaUserAgent = reservation.userAgent

            trackBookingCreated({
                clientId: gaClientId,
                userAgent: gaUserAgent,
                value: gaValue,
                currency: gaCurrency,
                room,
                quantity: requestedQty,
            }).catch(err => console.error('[GA4 MP] Unexpected error:', err))

            // Auto-create receipt when payment is verified — fire-and-forget so it
            // never blocks or fails the reservation response to the guest.
            if (verifiedPaid) {
                const receiptQtyLabel = requestedQty > 1 ? ` × ${requestedQty} units` : ''
                const receipt = new Receipt({
                    receiptNumber: "REC" + unique.randomCode(),
                    roomId: body.roomId,
                    hostId: room.hostId,
                    reservationId: newReservation._id,
                    customerName: body.customerName,
                    customerEmail: body.customerEmail,
                    customerPhone: phone,
                    description: `${nights} night${nights === 1 ? '' : 's'} stay${receiptQtyLabel}`,
                    originalAmount: room.price * nights * requestedQty,
                    discountPercent,
                    totalAmount,
                    currency: room.currency || 'NGN',
                    // Snapshot of the guest-currency conversion actually used at
                    // charge time (identical to sourceCurrency/sourceAmount with
                    // rate 1 when no conversion happened) — never recomputed
                    // later from a live rate, since this is a historical record
                    // of what was actually charged.
                    sourceCurrency,
                    sourceAmount: totalAmount,
                    guestCurrency,
                    chargedAmount: roundUpChargeAmount(totalAmount, quoteRate),
                    rate: quoteRate,
                    createdOn: DateUtil.currentDate(),
                })
                receipt.save().catch(err => console.error('[QB] Auto-receipt failed:', err))

                sendXConversionEvent({
                    conversionId: reservation.txRef || String(newReservation._id),
                    twclid: reservation.twclid,
                    ipAddress: reservation.clientIp,
                    userAgent: reservation.userAgent,
                }).catch(err => console.error('[X Conversion API] Unexpected error:', err))

                trackPurchase({
                    clientId: gaClientId,
                    userAgent: gaUserAgent,
                    transactionId: reservation.txRef || String(newReservation._id),
                    value: gaValue,
                    currency: gaCurrency,
                    room,
                    quantity: requestedQty,
                }).catch(err => console.error('[GA4 MP] Unexpected error:', err))
            }

            const checkoutTime = checkoutTimeLabel(reservation.checkOut, room.address?.country);

            // Send Email to customer
            var receiverName = `${body.customerName}`;
            var receiverEmail = `${body.customerEmail}`;

            const emailSubject = `Reservation Made ${reservation.code}`;

            const emailCurrency = (room.currency || 'NGN').toUpperCase()
            const emailOriginalNightlyRate = room.price ?? 0
            const emailOriginalRoomTotal = emailOriginalNightlyRate * nights * requestedQty
            const emailDiscountAmount = emailOriginalRoomTotal - (nightlyRate * nights * requestedQty)
            const fmt = (n) => new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(n)
            const unitsSuffix = requestedQty > 1 ? ` × ${requestedQty} units` : ''
            const cautionBreakdown = room.hasRefundableCautionFee && room.refundableCautionFee && requestedQty > 1
                ? ` (${emailCurrency} ${fmt(room.refundableCautionFee)} × ${requestedQty} units)` : ''
            // Shared by both the guest and host emails — a discount changes what
            // the host is actually paid out, so it belongs in both, not just the
            // guest-facing copy.
            const chargesTableRows = `
            <tr>
                <td style="padding: 8px;">Room stay (${emailCurrency} ${fmt(emailOriginalNightlyRate)} × ${nights} night${nights === 1 ? '' : 's'}${unitsSuffix})</td>
                <td style="padding: 8px; text-align: right;">${emailCurrency} ${fmt(emailOriginalRoomTotal)}</td>
            </tr>
            ${discountPercent > 0 ? `<tr><td style="padding: 8px; color: #5eac12;">Hot deal discount (-${discountPercent}%)</td><td style="padding: 8px; text-align: right; color: #5eac12;">-${emailCurrency} ${fmt(emailDiscountAmount)}</td></tr>` : ''}
            ${cautionFee > 0 ? `<tr><td style="padding: 8px;">Refundable caution fee${cautionBreakdown}</td><td style="padding: 8px; text-align: right;">${emailCurrency} ${fmt(cautionFee)}</td></tr>` : ''}
            <tr style="font-weight: bold; border-top: 2px solid #eee;">
                <td style="padding: 8px;">Total</td>
                <td style="padding: 8px; text-align: right;">${emailCurrency} ${fmt(totalAmount)}</td>
            </tr>`

            const emailText2 = `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 20px; line-height: 1.6;">
        <h2 style="color: #4CAF50;">Reservation Confirmation</h2>

        <p>Dear <strong>${body.customerName}</strong>,</p>

        <p>Thank you for choosing QuickBooking. ${verifiedPaid
            ? 'Your payment has been received and your reservation is confirmed.'
            : 'We are writing to confirm your reservation and guide you to complete your payment.'
        }</p>

        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <tr>
                <td style="padding: 8px; font-weight: bold;">Reservation Code:</td>
                <td style="padding: 8px;">${reservation.code}</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Property:</td>
                <td style="padding: 8px;">${room.title}</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Address:</td>
                <td style="padding: 8px;">${room.address?.street ?? ''}, ${room.address?.city ?? ''}, ${room.address?.country ?? ''}</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Check-in Date:</td>
                <td style="padding: 8px;">${formatDate(reservation.checkIn)}</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Check-out Date:</td>
                <td style="padding: 8px;">${formatDate(reservation.checkOut)} at ${checkoutTime}</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Nights:</td>
                <td style="padding: 8px;">${nights}</td>
            </tr>
            ${requestedQty > 1 ? `<tr><td style="padding: 8px; font-weight: bold;">Units:</td><td style="padding: 8px;">${requestedQty}</td></tr>` : ''}
        </table>

        ${emailOriginalNightlyRate > 0 ? `
        <h3 style="margin-top: 24px; border-bottom: 1px solid #eee; padding-bottom: 8px;">Charges</h3>
        <table style="width: 100%; border-collapse: collapse;">${chargesTableRows}
        </table>
        ` : ''}
        ${needsConversion ? `
        <p style="margin-top: 12px; padding: 10px; background: #f7f9fc; border-radius: 6px; font-size: 14px;">
            Charged to your card: <strong>${guestCurrency} ${fmt(roundUpChargeAmount(totalAmount, quoteRate))}</strong>
            (converted from ${emailCurrency} ${fmt(totalAmount)} at a rate of 1 ${emailCurrency} = ${quoteRate} ${guestCurrency}).
        </p>
        ` : ''}

        <p>If you have any questions or need support, feel free to contact us.</p>

        <p>Best regards,<br>
        QuickBooking Support Team</p>

        <a href="https://quickbooking.org" target="_blank">
        <img src="https://quickbooking.org/quickbooking-logo.png" alt="QuickBooking Logo" style="width: 150px; height: auto; margin-top: 20px;">
        </a>

        <p style="font-size: 12px; color: #aaa;">&copy; ${new Date().getFullYear()} QuickBooking. All rights reserved.</p>
        </div>
    `;

            ///////
            // Send Email to host
            var hostEmail = `${host.email}`;

            const emailSubjectHost = `Reservation Made ${reservation.code}`;

            const emailTextHost = `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 20px; line-height: 1.6;">
        <h2 style="color: #4CAF50;">Reservation Made</h2>

        <p>Dear <strong>${host.name}</strong>,</p>

        <p>This is to notify that there is a booking made to your property.</p>

        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <tr>
                <td style="padding: 8px; font-weight: bold;">Reservation Code:</td>
                <td style="padding: 8px;">${reservation.code}</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Property:</td>
                <td style="padding: 8px;">${room.title}</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Check-in Date:</td>
                <td style="padding: 8px;">${formatDate(reservation.checkIn)}</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Check-out Date:</td>
                <td style="padding: 8px;">${formatDate(reservation.checkOut)} at ${checkoutTime}</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Nights:</td>
                <td style="padding: 8px;">${nights}</td>
            </tr>
            ${requestedQty > 1 ? `<tr><td style="padding: 8px; font-weight: bold;">Units:</td><td style="padding: 8px;">${requestedQty}</td></tr>` : ''}
            <tr>
                <td style="padding: 8px; font-weight: bold;">Address:</td>
                <td style="padding: 8px;">${room.address?.street ?? ''}, ${room.address?.city ?? ''}, ${room.address?.country ?? ''}</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Customer Name:</td>
                <td style="padding: 8px;">${body.customerName}</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Customer Email:</td>
                <td style="padding: 8px;">${body.customerEmail}</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Customer Phone:</td>
                <td style="padding: 8px;">${body.customerPhone.code} ${body.customerPhone.number}</td>
            </tr>
            ${reservation.message ? `<tr>
                <td style="padding: 8px; font-weight: bold;">Special Request:</td>
                <td style="padding: 8px;">${escapeHtml(reservation.message)}</td>
            </tr>` : ''}
        </table>

        ${emailOriginalNightlyRate > 0 ? `
        <h3 style="margin-top: 24px; border-bottom: 1px solid #eee; padding-bottom: 8px;">Charges${discountPercent > 0 ? ' (hot deal applied)' : ''}</h3>
        <table style="width: 100%; border-collapse: collapse;">${chargesTableRows}
        </table>
        ` : ''}

        <p>If you have any questions or need support, feel free to contact us.</p>

        <p>Best regards,<br>
        QuickBooking Support Team</p>

        <a href="https://quickbooking.org" target="_blank">
        <img src="https://quickbooking.org/quickbooking-logo.png" alt="QuickBooking Logo" style="width: 150px; height: auto; margin-top: 20px;">
        </a>

        <p style="font-size: 12px; color: #aaa;">&copy; ${new Date().getFullYear()} QuickBooking. All rights reserved.</p>
        </div>
    `;


            // Admin notification email
            const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
            const emailSubjectAdmin = `[New Booking] ${reservation.code} — ${room.title}`;
            const emailTextAdmin = `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 20px; line-height: 1.6;">
        <h2 style="color: #5eac12;">New Booking Received</h2>

        <p>A new reservation has been made on QuickBooking.</p>

        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <tr>
                <td style="padding: 8px; font-weight: bold;">Reservation Code:</td>
                <td style="padding: 8px;">${reservation.code}</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Payment Status:</td>
                <td style="padding: 8px;">${reservation.paymentStatus}</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Check-in Date:</td>
                <td style="padding: 8px;">${formatDate(reservation.checkIn)}</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Check-out Date:</td>
                <td style="padding: 8px;">${formatDate(reservation.checkOut)} at ${checkoutTime}</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Property:</td>
                <td style="padding: 8px;">${room.title} (${room.code})</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Nights:</td>
                <td style="padding: 8px;">${nights}${requestedQty > 1 ? ` · ${requestedQty} units` : ''}</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Address:</td>
                <td style="padding: 8px;">${room.address?.street ?? ''}, ${room.address?.city ?? ''}, ${room.address?.country ?? ''}</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Host:</td>
                <td style="padding: 8px;">${host.name} (${host.code})</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Customer Name:</td>
                <td style="padding: 8px;">${body.customerName}</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Customer Email:</td>
                <td style="padding: 8px;">${body.customerEmail}</td>
            </tr>
            <tr>
                <td style="padding: 8px; font-weight: bold;">Customer Phone:</td>
                <td style="padding: 8px;">${body.customerPhone.code} ${body.customerPhone.number}</td>
            </tr>
            ${reservation.message ? `<tr>
                <td style="padding: 8px; font-weight: bold;">Special Request:</td>
                <td style="padding: 8px;">${escapeHtml(reservation.message)}</td>
            </tr>` : ''}
        </table>

        <a href="https://quickbooking.org" target="_blank">
        <img src="https://quickbooking.org/quickbooking-logo.png" alt="QuickBooking Logo" style="width: 150px; height: auto; margin-top: 20px;">
        </a>

        <p style="font-size: 12px; color: #aaa;">&copy; ${new Date().getFullYear()} QuickBooking. All rights reserved.</p>
        </div>
    `;

            // Fire-and-forget — email delivery must not block or fail the reservation response
            sendEmail(receiverEmail, emailSubject, emailText2, res)
                .catch(err => console.error("Email to guest failed:", err));
            sendEmail(hostEmail, emailSubjectHost, emailTextHost, res)
                .catch(err => console.error("Email to host failed:", err));
            if (adminEmail) {
                sendEmail(adminEmail, emailSubjectAdmin, emailTextAdmin, res)
                    .catch(err => console.error("Email to admin failed:", err));
            }

            const action = `New ${moduleName}- ${room.code}`;
            await createActivityLog(moduleName, action, body.customerName);

            // Only reshape the response when a conversion actually happened —
            // same-currency bookings (all traffic today) get the exact same
            // response as before this feature existed.
            const responseBody = (verifiedPaid && needsConversion)
                ? {
                    ...newReservation.toObject(),
                    sourceCurrency,
                    sourceAmount: totalAmount,
                    guestCurrency,
                    chargedAmount: roundUpChargeAmount(totalAmount, quoteRate),
                    rate: quoteRate,
                }
                : newReservation;

            return Response.successResponse(res, res.statusCode, responseBody);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
        try {
            const totalReservations = await Reservation.countDocuments();
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalReservations
            );

            if (totalReservations === 0) {
                return Response.customResponse(res, 200, res.statusCode, ResponseMessage.NO_DATA);
            }

            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
            }

            const reservations = await Reservation.find()
                .populate([
                    { path: "host", select: "id name code avatar" },
                    { path: "user", select: "id name code avatar" },
                    { path: "room", select: "id code title subtitle price currency hasRefundableCautionFee refundableCautionFee address", populate: { path: "category", select: "name" } },
                ])
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (reservations.length === 0) {
                return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            }

            pagination.data = reservations.map((item) => ({
                ...item.toJSON(),
            }));

            pagination.rows = totalReservations;


            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getById: async (req, res) => {
        try {
            const reservation = await Reservation.findById(req.params.id)
                .populate([
                    { path: "host", select: "id name code avatar" },
                    { path: "user", select: "id name code avatar" },
                    { path: "room", select: "id code title subtitle price currency hasRefundableCautionFee refundableCautionFee address", populate: { path: "category", select: "name" } },
                ])
            if (!reservation) {
                return Response.customResponse(res, 404, MessageUtility.NO_RECORD);
            }

            return Response.successResponse(res, res.statusCode, reservation);
        } catch (error) {
            return Response.errorResponse(res, 500, error);
        }
    },

    getByHost: async (req, res) => {
        try {
            const host = await Host.findOne({ code: req.params.code });

            if (!host) {
                return Response.customResponse(res, 404, ResponseMessage.NO_HOST_RECORD);
            }

            const hostId = host.id;

            const totalReservations = await Reservation.countDocuments({ hostId: hostId });
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalReservations
            );

            if (pagination.page > pagination.pages) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.OUTOF_DATA
                );
            }

            pagination.data = await Reservation.find({ hostId: hostId })
                .populate([
                    { path: "host", select: "id name code avatar" },
                    { path: "user", select: "id name code avatar" },
                    { path: "room", select: "id code title subtitle price currency hasRefundableCautionFee refundableCautionFee address", populate: { path: "category", select: "name" } },
                ])
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (totalReservations === 0) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.NO_DATA
                );
            }

            pagination.data = pagination.data.map((item) => ({
                ...item.toJSON(),
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getByUser: async (req, res) => {
        try {
            const user = await Guest.findOne({ code: req.params.code });

            if (!user) {
                return Response.customResponse(res, 404, ResponseMessage.NO_HOST_RECORD);
            }

            const userId = user.id;
            const userQuery = { $or: [{ userId: userId }, { customerEmail: user.email }] };

            const totalReservations = await Reservation.countDocuments(userQuery);
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalReservations
            );

            if (pagination.page > pagination.pages) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.OUTOF_DATA
                );
            }

            pagination.data = await Reservation.find(userQuery)
                .populate([
                    { path: "host", select: "id name code avatar" },
                    { path: "user", select: "id name code avatar" },
                    { path: "room", select: "id code title subtitle price currency hasRefundableCautionFee refundableCautionFee address", populate: { path: "category", select: "name" } },
                ])
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (totalReservations === 0) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.NO_DATA
                );
            }

            // Only guests who actually paid in a converted currency need the
            // charged-currency snapshot — bulk-fetch those Receipt docs once
            // rather than per-reservation, and merge in only when a real
            // conversion happened (guestCurrency differs from the receipt's
            // own sourceCurrency).
            const reservationIds = pagination.data.map((item) => item._id);
            const receipts = await Receipt.find({
                reservationId: { $in: reservationIds },
                guestCurrency: { $exists: true, $ne: null },
            }).select("reservationId sourceCurrency sourceAmount guestCurrency chargedAmount rate");
            const receiptByReservationId = new Map(
                receipts
                    .filter((r) => r.guestCurrency && r.guestCurrency !== r.sourceCurrency)
                    .map((r) => [String(r.reservationId), r])
            );

            pagination.data = pagination.data.map((item) => {
                const json = { ...item.toJSON() };
                const receipt = receiptByReservationId.get(String(item._id));
                if (receipt) {
                    json.sourceCurrency = receipt.sourceCurrency;
                    json.sourceAmount = receipt.sourceAmount;
                    json.guestCurrency = receipt.guestCurrency;
                    json.chargedAmount = receipt.chargedAmount;
                    json.rate = receipt.rate;
                }
                return json;
            });

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    cancelReservation: async (req, res) => {
        try {
            const reservation = await Reservation.findById(req.params.id);

            if (!reservation) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            if (reservation.status != "Pending") {
                return Response.customResponse(res, 400, ResponseMessage.RESERVATION_UPDATE_FAILED);
            }

            reservation.status = "Cancelled";
            reservation.updatedOn = DateUtil.currentDate();

            await reservation.save();

            const action = `${moduleName} Cancelled - ${reservation._id}`;
            const person = reservation.userId;

            await createActivityLog(moduleName, action, person);

            return Response.customResponse(
                res,
                res.statusCode,
                ResponseMessage.SUCCESS_MESSAGE
            );
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    checkIn: async (req, res) => {
        try {

            const reservationId = req.params.reservationId;

            const reservation = await Reservation.findById(reservationId);
            if (!reservation) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            reservation.status = "Checked In";
            reservation.updatedOn = DateUtil.currentDate();
            await reservation.save();

            const action = `${moduleName} Checked In - ${reservation._id}`;
            const person = reservation.userId;

            await createActivityLog(moduleName, action, person);

            return Response.customResponse(
                res,
                res.statusCode,
                ResponseMessage.SUCCESS_MESSAGE
            );
        } catch (error) {
            return Response.errorResponse(res, 500, error);
        }
    },

    checkOut: async (req, res) => {
        try {
            const reservationId = req.params.reservationId;

            const reservation = await Reservation.findById(reservationId);
            if (!reservation) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            if (reservation.status !== "Checked In") {
                return Response.customResponse(res, 400, ResponseMessage.NOT_CHECKEDIN);
            }

            reservation.status = "Checked Out";
            reservation.updatedOn = DateUtil.currentDate();
            await reservation.save();

            const action = `${moduleName} Checked Out - ${reservation._id}`;
            const person = reservation.userId;

            await createActivityLog(moduleName, action, person);

            return Response.customResponse(
                res,
                res.statusCode,
                ResponseMessage.SUCCESS_MESSAGE
            );
        } catch (error) {
            return Response.errorResponse(res, 500, error);
        }
    },

    getReservationCountByStatus: async (req, res) => {
        try {
            const totalReservations = await Reservation.countDocuments();
            const pending = await Reservation.countDocuments({ status: "Pending" });
            const checkedIn = await Reservation.countDocuments({ status: "Checked In" });
            const checkedOut = await Reservation.countDocuments({ status: "Checked Out" });
            const cancelled = await Reservation.countDocuments({ status: "Cancelled" });

            // Return only the counts
            return res.status(200).json({
                totalReservations,
                pending,
                checkedIn,
                checkedOut,
                cancelled
            });
        } catch (error) {
            console.error("Error fetching applications counts:", error);
            return Response.customResponse(res, 500, error.message);
        }
    },

    getHostReservationCountByStatus: async (req, res) => {
        try {
            const { hostId } = req.params;
            const totalReservations = await Reservation.countDocuments({ hostId: hostId });
            const pending = await Reservation.countDocuments({ hostId: hostId, status: "Pending" });
            const checkedIn = await Reservation.countDocuments({ hostId: hostId, status: "Checked In" });
            const checkedOut = await Reservation.countDocuments({ hostId: hostId, status: "Checked Out" });
            const cancelled = await Reservation.countDocuments({ hostId: hostId, status: "Cancelled" });

            // Return only the counts
            return res.status(200).json({
                totalReservations,
                pending,
                checkedIn,
                checkedOut,
                cancelled
            });
        } catch (error) {
            console.error("Error fetching applications counts:", error);
            return Response.customResponse(res, 500, error.message);
        }
    },
}

