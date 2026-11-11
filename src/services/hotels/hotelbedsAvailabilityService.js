const axios = require("axios");
const {
  getHotelbedsHeaders,
} = require("../utilities/hotelsAuth_utility/hotels_auth_utility");

const BASE_URL = (
  process.env.HOTELBEDS_BASE_URL || "https://api.test.hotelbeds.com"
).replace(/\/+$/, "");

const API_VERSION = process.env.HOTELBEDS_API_VERSION || "1.0";

const HOTELBEDS_TIMEOUT = 30000;

const hotelbedsClient = axios.create({
  baseURL: BASE_URL,
  timeout: HOTELBEDS_TIMEOUT,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

/**
 * Search availability using Hotelbeds Hotel API.
 *
 * @param {Object} payload Hotelbeds availability request body
 */
async function searchHotelAvailability(payload) {
  const url = `/hotel-api/${API_VERSION}/hotels`;

  try {
    const response = await hotelbedsClient.post(url, payload, {
      headers: getHotelbedsHeaders(),
    });

    return response.data;
  } catch (error) {
    const status = error.response?.status;

    const details = error.response?.data || {
      message: error.message,
    };

    const apiError = new Error(
      details?.error ||
        details?.message ||
        "Hotelbeds availability request failed",
    );

    apiError.status = status || 502;
    apiError.details = details;

    throw apiError;
  }
}

module.exports = {
  searchHotelAvailability,
};
