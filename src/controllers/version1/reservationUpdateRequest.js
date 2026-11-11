const Reservation = require("../../models/reservation");
const ReservationUpdateRequest = require("../../models/reservationUpdateRequest");
const Host = require("../../models/hosts");
const { reservationUpdateRequestValidation } = require("../../validations/reservationUpdateRequest");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/qbActivityLog_utility");

const moduleName = `Reservation Update Request`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;
            const { error } = reservationUpdateRequestValidation(body);

            if (error) {
                return Response.sendValidationErrorMessage(res, 400, error);
            }

            const reservation = await Reservation.findById(body.reservationId);

            if (!reservation)
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            const overlap = await Reservation.findOne({
                roomId: reservation.roomId,
                checkIn: { $lt: new Date(body.checkOut) },
                checkOut: { $gt: new Date(body.checkIn) }
            });

            if (overlap) {
                return Response.customResponse(res, 409, "Room is already reserved during the selected dates.");
            }

            const reservationUpdateReq = new ReservationUpdateRequest({
                reservationId: body.reservationId,
                hostId: reservation.hostId,
                userId: reservation.userId,
                checkIn: body.checkIn,
                checkOut: body.checkOut,
                status: "Pending",
                message: body.message,
                createdOn: DateUtil.currentDate(),
            });

            const newReservationUpdateReq = await reservationUpdateReq.save();

            const action = `New ${moduleName}- ${reservation.id}`;
            await createActivityLog(moduleName, action, reservation.userId);

            return Response.successResponse(res, res.statusCode, newReservationUpdateReq);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
        try {
            const totalReservationUpdateRequests = await ReservationUpdateRequest.countDocuments();
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalReservationUpdateRequests
            );

            if (totalReservationUpdateRequests === 0) {
                return Response.customResponse(res, 200, res.statusCode, ResponseMessage.NO_DATA);
            }

            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
            }

            const reservationUpdateRequests = await ReservationUpdateRequest.find()
                .populate({
                    path: "reservation",
                    populate: [
                        { path: "host", select: "id name code avatar" },
                        { path: "user", select: "id name code avatar" },
                        { path: "room", select: "id code title subtitle price" }
                    ],
                })
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (reservationUpdateRequests.length === 0) {
                return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            }

            pagination.data = reservationUpdateRequests.map((item) => ({
                ...item.toJSON(),
            }));

            pagination.rows = totalReservationUpdateRequests;


            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getById: async (req, res) => {
        try {
            const reservationUpdaterequest = await ReservationUpdateRequest.findById(req.params.id)
                .populate({
                    path: "reservation",
                    populate: [
                        { path: "host", select: "id name code avatar" },
                        { path: "user", select: "id name code avatar" },
                        { path: "room", select: "id code title subtitle price" }
                    ],
                })
            if (!reservationUpdaterequest) {
                return Response.customResponse(res, 404, MessageUtility.NO_RECORD);
            }

            return Response.successResponse(res, res.statusCode, reservationUpdaterequest);
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

            const totalReservationUpdateRequests = await ReservationUpdateRequest.countDocuments({ hostId: hostId });
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalReservationUpdateRequests
            );

            if (pagination.page > pagination.pages) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.OUTOF_DATA
                );
            }

            pagination.data = await ReservationUpdateRequest.find({ hostId: hostId })
                .populate({
                    path: "reservation",
                    populate: [
                        { path: "host", select: "id name code avatar" },
                        { path: "user", select: "id name code avatar" },
                        { path: "room", select: "id code title subtitle price" }
                    ],
                })
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (totalReservationUpdateRequests === 0) {
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
            const user = await Host.findOne({ code: req.params.code });

            if (!user) {
                return Response.customResponse(res, 404, ResponseMessage.NO_HOST_RECORD);
            }

            const userId = user.id;

            const totalReservationUpdateRequests = await ReservationUpdateRequest.countDocuments({ userId: userId });
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalReservationUpdateRequests
            );

            if (pagination.page > pagination.pages) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.OUTOF_DATA
                );
            }

            pagination.data = await ReservationUpdateRequest.find({ userId: userId })
                .populate({
                    path: "reservation",
                    populate: [
                        { path: "host", select: "id name code avatar" },
                        { path: "user", select: "id name code avatar" },
                        { path: "room", select: "id code title subtitle price" }
                    ],
                })
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (totalReservationUpdateRequests === 0) {
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

    getByReservation: async (req, res) => {
        try {
            const totalReservationUpdateRequests = await ReservationUpdateRequest.countDocuments({ reservationId: req.params.id });
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalReservationUpdateRequests
            );

            if (pagination.page > pagination.pages) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.OUTOF_DATA
                );
            }

            pagination.data = await ReservationUpdateRequest.find({ reservationId: req.params.id })
                .populate({
                    path: "reservation",
                    populate: [
                        { path: "host", select: "id name code avatar" },
                        { path: "user", select: "id name code avatar" },
                        { path: "room", select: "id code title subtitle price" }
                    ],
                })
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (totalReservationUpdateRequests === 0) {
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

    acceptRequest: async (req, res) => {
        try {

            const reservationUpdateRequest = await ReservationUpdateRequest.findById(req.params.id);

            if (!reservationUpdateRequest) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            if (reservationUpdateRequest.status != "Pending") {
                return Response.customResponse(res, 400, ResponseMessage.RESERVATION_UPDATE_FAILED);
            }

            const reservation = await Reservation.findById(reservationUpdateRequest.reservationId);

            if (!reservation) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            reservationUpdateRequest.status = "Accepted";
            reservationUpdateRequest.updatedOn = DateUtil.currentDate();

            // update the reservation
            reservation.checkIn = reservationUpdateRequest.checkIn;
            reservation.checkOut = reservationUpdateRequest.checkOut;

            await reservationUpdateRequest.save();
            await reservation.save();

            const action = `${moduleName} Accepted - ${reservationUpdateRequest._id}`;
            const person = reservationUpdateRequest.hostId;

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

    rejectRequest: async (req, res) => {
        try {

            const reservationUpdateRequest = await ReservationUpdateRequest.findById(req.params.id);

            if (!reservationUpdateRequest) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            if (reservationUpdateRequest.status != "Pending") {
                return Response.customResponse(res, 400, ResponseMessage.RESERVATION_UPDATE_FAILED);
            }

            reservationUpdateRequest.status = "Rejected";
            reservationUpdateRequest.updatedOn = DateUtil.currentDate();

            const update = await reservationUpdateRequest.save();

            const action = `${moduleName} Accepted - ${reservationUpdateRequest._id}`;
            const person = reservationUpdateRequest.hostId;

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

    delete: async (req, res) => {
        try {
            const param = req.params;
            const reservationUpdateRequest = await ReservationUpdateRequest.findById(param.id);

            if (!reservationUpdateRequest) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            if (reservationUpdateRequest.status != "Pending") {
                return Response.customResponse(res, 400, ResponseMessage.RESERVATION_UPDATE_FAILED);
            }

            await reservationUpdateRequest.deleteOne();

            const action = `Deleted ${moduleName}- ${reservationUpdateRequest.id}`;
            const person = reservationUpdateRequest.userId;
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

}