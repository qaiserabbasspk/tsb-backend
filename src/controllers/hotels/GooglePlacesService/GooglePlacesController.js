
const googlePlaces = require("../../../services/hotels/GooglePlacesService/GooglePlacesService");

function handleError(res, error) {
  const status = error.response?.status || 500;

  console.error(
    "Google Places API error:",
    error.response?.data || error.message
  );

  if (status === 429) {
    return res.status(429).json({
      success: false,
      message: "Google Places request limit reached. Try again later.",
    });
  }

  return res.status(status >= 400 && status < 500 ? status : 500).json({
    success: false,
    message:
      error.response?.data?.error?.message ||
      error.message ||
      "Google Places request failed",
  });
}

exports.autocomplete = async (req, res) => {
  try {
    const input = String(req.query.input || "").trim();

    console.log("Autocomplete request input:", input);

    if (input.length < 2) {
      return res.json({ success: true, data: [] });
    }

    if (input.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Search input is too long",
      });
    }

    const data = await googlePlaces.autocomplete(input, {
      languageCode: req.query.language || "en",
      regionCode: req.query.region,
      sessionToken: req.query.sessionToken,
    });
 console.log("Autocomplete request input:", data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.search = async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Query parameter q is required",
      });
    }

    const data = await googlePlaces.searchPlaces(query, {
      limit: req.query.limit,
      languageCode: req.query.language || "en",
      regionCode: req.query.region,
      includedType: req.query.type,
    });

    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.details = async (req, res) => {
  try {
    const data = await googlePlaces.getPlaceDetails(
      req.params.placeId,
      req.query.language || "en"
    );

    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.nearby = async (req, res) => {
  try {
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    const radius = Number(req.body.radius || 5000);
    const limit = Number(req.body.limit || 10);
    const includedTypes = req.body.includedTypes || [];

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid latitude and longitude are required",
      });
    }

    if (
      !Array.isArray(includedTypes) ||
      includedTypes.length > 5 ||
      includedTypes.some((type) => typeof type !== "string")
    ) {
      return res.status(400).json({
        success: false,
        message: "includedTypes must be an array of up to 5 types",
      });
    }

    if (radius <= 0 || limit < 1 || limit > 20) {
      return res.status(400).json({
        success: false,
        message: "Radius must be positive and limit must be 1–20",
      });
    }

    const data = await googlePlaces.searchNearby({
      latitude,
      longitude,
      radius,
      includedTypes,
      limit,
    });

    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};
