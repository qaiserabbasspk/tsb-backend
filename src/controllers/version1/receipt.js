const Reservation = require("../../models/reservation");
const Host = require("../../models/hosts");
const Room = require("../../models/rooms");
const Receipt = require("../../models/receipt");
const { receiptValidation } = require("../../validations/receipt");

// UTILITIES
const unique = require("../../utilities/codegenerator_utility");
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/qbActivityLog_utility");
const { sendEmail } = require("../../utilities/quickbookingEmailer_utility");

const moduleName = `Receipt`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;
            const uniqueCode = unique.randomCode();
            const { error } = receiptValidation(body);

            if (error) {
                return Response.sendValidationErrorMessage(res, 400, error);
            }

            const host = await Host.findById(body.hostId);
            const reservation = await Reservation.findById(body.reservationId);
            const room = await Room.findById(body.roomId);

            if (!host || !room || !reservation)
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            const phone = { ...body.customerPhone };
            const discountPercent = body.discountPercent || 0;
            const discountLine = discountPercent > 0 && body.originalAmount
                ? `<br>Original amount: <strike>NGN ${body.originalAmount}</strike> — ${discountPercent}% hot deal discount applied`
                : '';

            const receipt = new Receipt({
                receiptNumber: "REC" + uniqueCode,
                roomId: body.roomId,
                hostId: body.hostId,
                reservationId: body.reservationId,
                customerName: body.customerName,
                customerEmail: body.customerEmail,
                customerPhone: phone,
                description: body.description,
                totalAmount: body.totalAmount,
                originalAmount: body.originalAmount,
                discountPercent,
                currency: body.currency,
                createdOn: DateUtil.currentDate(),
            });

            const newReceipt = await receipt.save();

            const emailSubject = `QuickBooking Receipt`;

            // Send Email to customer
            const emailTextGuest = `Dear ${body.customerName}, <br><br>
            <strong>Receipt Number: ${receipt.receiptNumber}</strong><br><br>
            This email confirms that we have received your payment for your reservation <a href="https://admin.rentrack.org" target="_blank">
            <strong>${reservation.code}</strong></a>, for room ${room.title} - ${room.code},
            in the amount of <strong>NGN ${body.totalAmount}</strong>.${discountLine}<br><br>

            Thank you for choosing QuickBooking<br><br>

           <p>Best regards,<br>
            QuickBooking Support Team</p>
            <a href="https://quickbooking.org" target="_blank">
            <img src="https://quickbooking.org/quickbooking-logo.png" alt="QuickBooking Logo" style="width: 150px; height: auto; margin-top: 20px;">
            </a><br>
            &copy; ${new Date().getFullYear()} QuickBooking, All rights reserved.`;

            // Send Email to host — the host needs to see what the guest was
            // actually charged (including any hot-deal discount) too, not just
            // the guest.
            const emailTextHost = `Dear ${host.name}, <br><br>
            <strong>Receipt Number: ${receipt.receiptNumber}</strong><br><br>
            A receipt has been issued for reservation <strong>${reservation.code}</strong>,
            for room ${room.title} - ${room.code}, in the amount of <strong>NGN ${body.totalAmount}</strong>.${discountLine}<br><br>

            <p>Best regards,<br>
            QuickBooking Support Team</p>
            <a href="https://quickbooking.org" target="_blank">
            <img src="https://quickbooking.org/quickbooking-logo.png" alt="QuickBooking Logo" style="width: 150px; height: auto; margin-top: 20px;">
            </a><br>
            &copy; ${new Date().getFullYear()} QuickBooking, All rights reserved.`;

            // Fire-and-forget, matching reservation.js — the receipt is already
            // saved, so an email hiccup must never turn into a 500 for an admin
            // who just successfully issued it.
            sendEmail(body.customerEmail, emailSubject, emailTextGuest, res)
                .catch(err => console.error("Receipt email to guest failed:", err));
            if (host.email) {
                sendEmail(host.email, emailSubject, emailTextHost, res)
                    .catch(err => console.error("Receipt email to host failed:", err));
            }

            // const action = `New ${moduleName}- ${receipt.receiptNumber}`;
            // await createActivityLog(moduleName, action, body.customerName);

            return Response.successResponse(res, res.statusCode, newReceipt);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
        try {
            const totalReceipts = await Receipt.countDocuments();
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalReceipts
            );

            if (totalReceipts === 0) {
                return Response.customResponse(res, 200, res.statusCode, ResponseMessage.NO_DATA);
            }

            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
            }

            const receipts = await Receipt.find()
                .populate([
                    { path: "host", select: "id name code avatar" },
                    { path: "reservation", select: "id code checkIn checkOut" },
                    { path: "room", select: "id code title subtitle price" },
                ])
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (receipts.length === 0) {
                return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            }

            pagination.data = receipts.map((item) => ({
                ...item.toJSON(),
            }));

            pagination.rows = totalReceipts;

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getByHost: async (req, res) => {
        try {
            const totalReceipts = await Receipt.countDocuments({ hostId: req.params.hostId });
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalReceipts
            );

            if (totalReceipts === 0) {
                return Response.customResponse(res, 200, res.statusCode, ResponseMessage.NO_DATA);
            }

            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
            }

            const receipts = await Receipt.find({ hostId: req.params.hostId })
                .populate([
                    { path: "host", select: "id name code avatar" },
                    { path: "reservation", select: "id code checkIn checkOut" },
                    { path: "room", select: "id code title subtitle price" },
                ])
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (receipts.length === 0) {
                return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            }

            pagination.data = receipts.map((item) => ({
                ...item.toJSON(),
            }));

            pagination.rows = totalReceipts;

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    search: async (req, res) => {
        try {
            const body = req.body;

            const room = body.roomId ? await Room.findById(body.roomId) : null;

            if (body.roomId && !room) return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
            let query = {};

            if (body.receiptNumber) query.receiptNumber = body.receiptNumber;
            if (body.roomId) query.roomId = body.roomId;
            if (body.customerName) query.customerName = body.customerName;

            // Get total receipts
            const totalReceipts = await Receipt.countDocuments(query);

            if (totalReceipts === 0) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            // Get pagination
            const { pagination, skip } = await PaginationUtility.paginationParams(req, totalReceipts);

            if (pagination.page > pagination.pages || pagination.page < 1) {
                return Response.customResponse(res, 400, "Page is Out of Range");
            }

            // Get paginated Invoices
            const receipts = await Receipt.find(query)
                .populate([
                    { path: "host", select: "id name code avatar" },
                    { path: "reservation", select: "id code checkIn checkOut" },
                    { path: "room", select: "id code title subtitle price" },
                ])
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            const responseData = receipts.map((item) => ({
                ...item.toJSON(),
                host: item.host ? item.host : null,
                reservation: item.reservation? item.reservation : null,
                room: item.room ? item.room : null,
            }));

            pagination.data = responseData;
            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            // console.error("Error:", err);
            return Response.errorResponse(res, 500, err.message || err);
        }
    },
}