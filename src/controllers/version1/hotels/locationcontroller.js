const locationService = require("../../../services/locationservice");

exports.searchLocations = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();

    if (q.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Enter at least 2 characters to search.",
      });
    }

    const result = await locationService.searchLocations(q, {
      language: "ENG",
      fields: "all",
      limit: 20,
    });

    console.log("Location search result:", result);
    return res.status(200).json({
      success: true,
      message: "Location search completed.",
      data: result,
    });
  } catch (error) {
    console.error("Location search error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Location search failed.",
      ...(error.providerErrors ? { errors: error.providerErrors } : {}),
    });
  }
};