const GuestLead = require("../../models/guestLead");

// UTILITIES
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");

module.exports = {
    getAll: async (req, res) => {
        try {
            const filter = {};
            if (req.query.source) {
                filter["sources.type"] = req.query.source;
            }

            const totalGuestLeads = await GuestLead.countDocuments(filter);
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalGuestLeads
            );

            if (pagination.page > pagination.pages) {
                return res.status(200).json({
                    message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
                });
            }

            pagination.data = await GuestLead.find(filter)
                .select()
                .sort({ lastSeenAt: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            pagination.data = pagination.data.map((doc) => {
                doc.id = doc._id.toHexString();
                return doc;
            });

            if (pagination.length === 0) {
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
};
