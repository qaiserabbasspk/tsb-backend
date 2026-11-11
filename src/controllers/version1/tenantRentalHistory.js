const TenantRentalHistory = require("../../models/tenantRentalHistory");
const { tenantRentalHistoryValidation } = require("../../validations/tenantRentalHistory");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const { status } = require("../../utilities/status_change_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");
const moduleName = `SubscriptionPlan`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;

            const { error } = tenantRentalHistoryValidation(body);

            if (error) {
                return Response.sendValidationErrorMessage(res, 400, error);
            }

            const tenantRentalHistory = new TenantRentalHistory({
                tenantName: body.tenantName,
                currentAddress: body.currentAddress,
                propertyMgtCompanyName: body.propertyMgtCompanyName,
                pointOfContact: body.pointOfContact,
                isResident: body.isResident,
                leaseStartDate: body.leaseStartDate,
                leasseEndDate: body.leasseEndDate,
                monthlyRent: body.monthlyRent,
                wouldYouRentAgain: body.wouldYouRentAgain,
                wasVacateNoticeGiven: body.wasVacateNoticeGiven,
                havePets: body.havePets,
                pets: body.pets,
                petsAllowed: body.petsAllowed,
                latePayments: body.latePayments,
                anyComplaints: body.anyComplaints,
                anyDamages: body.anyDamages,
                anyOverdueBalance: body.anyOverdueBalance,
                createdOn: DateUtil.currentDate(),
            });

            const newTenantRentalHistory = await tenantRentalHistory.save();

            return Response.successResponse(res, res.statusCode, newTenantRentalHistory);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
        try {
            const totalHistories = await TenantRentalHistory.countDocuments();
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalHistories
            );

            if (totalHistories == 0) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.NO_DATA
                );
            }

            if (pagination.page > pagination.pages) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.OUTOF_DATA
                );
            }

            pagination.data = await TenantRentalHistory.find()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },
}