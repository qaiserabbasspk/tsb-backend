const ReportUser = require("../../models/reportUser");
const Host = require("../../models/hosts");
const ReportReason = require("../../models/reportReasons");

// VALIDATIONS
const { reportUserValidation } = require("../../validations/reportUser");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/qbActivityLog_utility");

const moduleName = `Report User`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;

            const { error } = reportUserValidation(body);

            if (error) {
                return Response.errorResponse(res, 400, error);
            }

            const reporter = await Host.findById(body.reporterId);
            const target = await Host.findById(body.targetUserId);
            const reason = await ReportReason.findById(body.reasonId);

            if (!reporter || !target || !reason)
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            const reportUser = ReportUser({
                reporterId: body.reporterId,
                targetUserId: body.targetUserId,
                reasonId: body.reasonId,
                createdOn: DateUtil.currentDate(),
            });

            const newReport = await reportUser.save();
            return Response.successResponse(res, res.statusCode, newReport);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
        try {
            const totalUserReports = await ReportUser.countDocuments();
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalUserReports
            );

            if (totalUserReports === 0) {
                return Response.customResponse(res, 200, res.statusCode, ResponseMessage.NO_DATA);
            }

            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
            }

            const userReports = await ReportUser.find()
                .populate([
                    { path: "reporter", select: "id name code" },
                    { path: "targetUser", select: "id name code" },
                    { path: "reason", select: "id reason" },
                ])
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (userReports.length === 0) {
                return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            }

            pagination.data = userReports.map((item) => ({
                ...item.toJSON(),
            }));

            pagination.rows = totalUserReports;


            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    delete: async (req, res) => {
        try {
            const param = req.params;
            const reportUser = await ReportUser.findById(param.id);

            if (!reportUser) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            await reportUser.deleteOne();

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