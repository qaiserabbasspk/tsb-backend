const ReportReason = require("../../models/reportReasons");

// VALIDATIONS
const { reportReasonValidation } = require("../../validations/reportReason");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/qbActivityLog_utility");

const moduleName = `Report Reason`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;

            const { error } = reportReasonValidation(body);

            if (error) {
                return Response.errorResponse(res, 400, error);
            }

            const reason = ReportReason({
                reason: body.reason,
                createdOn: DateUtil.currentDate(),
            });

            const newReason = await reason.save();

            const action = `New ${moduleName} - ${newReason._id}`;
            const person = body.actionBy;
            await createActivityLog(moduleName, action, person);

            return Response.successResponse(res, res.statusCode, newReason);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
        try {
            const totalReasons = await ReportReason.countDocuments();

            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalReasons
            );

            if (pagination.page > pagination.pages) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.OUTOF_DATA
                );
            }

            pagination.data = await ReportReason.find()
                .skip(skip)
                .limit(pagination.pageSize);

            if (totalReasons === 0) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.NO_DATA
                );
            }

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    update: async (req, res) => {
        try {
            const body = req.body;
            if (!body.actionBy) {
                return Response.customResponse(
                    res,
                    400,
                    ResponseMessage.ACTIONBY_REQUIRED
                );
            }

            const reason = await ReportReason.findById(body.id);

            if (!reason) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            reason.reason = body.reason || reason.reason;

            const update = await reason.save();

            const action = `Updated ${moduleName} - ${reason._id}`;
            const person = body.actionBy;

            await createActivityLog(moduleName, action, person);

            return Response.successResponse(res, res.statusCode, update);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    delete: async (req, res) => {
        try {
            const param = req.params;
            const reason = await ReportReason.findById(param.id);

            if (!reason) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            await reason.deleteOne();

            const action = `Deleted ${moduleName}- ${reason.id}`;
            const person = param.actionBy;
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