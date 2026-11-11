const Response = require("../../utilities/response_utility");
const DateUtil = require("../../utilities/date_utility");
const {
    getSettings,
    loadDoc,
    invalidate,
} = require("../../utilities/settings_utility");

module.exports = {
    get: async (req, res) => {
        try {
            const settings = await getSettings();
            return Response.successResponse(res, 200, settings);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    update: async (req, res) => {
        try {
            const body = req.body;
            const doc = await loadDoc();

            if (typeof body.hostEmailVerificationEnabled === "boolean") {
                doc.hostEmailVerificationEnabled =
                    body.hostEmailVerificationEnabled;
            }
            if (typeof body.listingReviewEnabled === "boolean") {
                doc.listingReviewEnabled = body.listingReviewEnabled;
            }

            doc.updatedBy = req.user?.code || req.user?.email || "admin";
            doc.updatedOn = DateUtil.currentDate();
            await doc.save();
            invalidate();

            return Response.successResponse(res, 200, {
                hostEmailVerificationEnabled: doc.hostEmailVerificationEnabled,
                listingReviewEnabled: doc.listingReviewEnabled,
            });
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },
};
