const { resolveCountry } = require("../../utilities/geo_utility");
const Response = require("../../utilities/response_utility");

module.exports = {
    detect: async (req, res) => {
        const country = resolveCountry(req);
        return Response.successResponse(res, 200, { country });
    },
};
