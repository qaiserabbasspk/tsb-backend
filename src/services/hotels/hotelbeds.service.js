const axios = require("axios");
const crypto = require("crypto");

const {
  getHotelbedsConfig,
  getHttpsAgent,
} = require("../../config/hotelbeds.config");

const config = getHotelbedsConfig();
const httpsAgent = getHttpsAgent();

const client = axios.create({
  baseURL: config.baseUrl,
  timeout: config.timeout,
  httpsAgent,
  headers: {
    Accept: "application/json",
    "Accept-Encoding": "gzip",
    "Content-Type": "application/json",
  },
});

function getSignature() {
  const timestamp = Math.floor(Date.now() / 1000).toString();

  return crypto
    .createHash("sha256")
    .update(config.apiKey + config.apiSecret + timestamp)
    .digest("hex");
}

async function request(method, url, data, params) {
  try {
    const response = await client.request({
      method,
      url,
      data,
      params,
      headers: {
        "Api-key": config.apiKey,
        "X-Signature": getSignature(),
      },
    });

    return response.data;
  } catch (error) {
    const status = error.response?.status || 502;
    const supplierData = error.response?.data;

    console.error("Hotelbeds API error:", {
      method,
      url,
      status,
      supplierData,
    });

    const apiError = new Error("Hotelbeds request failed. Please try again.");

    apiError.status = status >= 400 && status < 500 ? status : 502;
    apiError.supplierData = supplierData;

    throw apiError;
  }
}

// 1. Hotel availability and rates
async function searchHotels(payload) {
  return request("POST", `/hotel-api/${config.bookingVersion}/hotels`, payload);
}

// 2. Recheck a selected rate
async function checkRates(payload) {
  return request(
    "POST",
    `/hotel-api/${config.bookingVersion}/checkrates`,
    payload,
  );
}

// 3. Confirm a booking
async function createBooking(payload) {
 async function request(method, path, body) {
  const res = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: { /* your existing auth/signature headers */ },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  if (!res.ok) {
    console.error("Hotelbeds error", res.status, JSON.stringify(json, null, 2));
    const err = new Error(json?.error?.message || "Hotelbeds request failed.");
    err.status = res.status;
    err.details = json;
    throw err;
  }

  return json;
}
}

// 4. Retrieve static hotel content
async function getHotelsContent(params) {
  console.log("Payloade", params);
  return request(
    "GET",
    `/hotel-content-api/${config.contentVersion}/hotels`,
    undefined,
    params,
  );
}

/**
 * Retrieve hotel details by one or more hotel codes.
 *
 * Supports:
 *   "1067,1070"
 *   [1067, 1070]
 *   1067
 *
 * Hotelbeds Content API:
 *   GET /hotel-content-api/1.0/hotels/{hotelCodes}
 */
async function getHotelDetails(hotelCodes, params = {}) {
  let rawCodes;

  if (Array.isArray(hotelCodes)) {
    rawCodes = hotelCodes;
  } else if (typeof hotelCodes === "string" || typeof hotelCodes === "number") {
    rawCodes = String(hotelCodes).split(",");
  } else {
    rawCodes = [];
  }

  const codes = rawCodes.map((code) => String(code).trim());

  if (codes.length === 0 || codes.some((code) => !/^\d+$/.test(code))) {
    const error = new Error(
      "hotelCodes must contain valid numeric hotel codes, e.g. 1067,1070."
    );
    error.status = 400;
    throw error;
  }

  const uniqueCodes = [...new Set(codes)];

  const queryParams = {};

  if (params.language) {
    queryParams.language = params.language;
  }

  if (params.useSecondaryLanguage !== undefined) {
    queryParams.useSecondaryLanguage =
      params.useSecondaryLanguage === true ||
      params.useSecondaryLanguage === "true";
  }

  const hotelCodesPath = uniqueCodes.join(",");

  const response = await request(
    "GET",
    `/hotel-content-api/${config.contentVersion}/hotels/${hotelCodesPath}/details`,
    undefined,
    queryParams
  );

  console.log("Hotel details response:", response);

  return response;
}

module.exports = {
  searchHotels,
  checkRates,
  createBooking,
  getHotelsContent,
  getHotelDetails,
};
