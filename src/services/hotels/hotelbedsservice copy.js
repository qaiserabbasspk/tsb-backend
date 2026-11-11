
const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = (
  process.env.HOTELBEDS_BASE_URL ||
  'https://api.test.hotelbeds.com'
).replace(/\/+$/, '');

const API_VERSION = process.env.HOTELBEDS_API_VERSION || '1.0';

function getCredentials() {
  const apiKey = process.env.HOTELBEDS_API_KEY;
  const apiSecret = process.env.HOTELBEDS_API_SECRET;

  if (!apiKey || !apiSecret) {
    const error = new Error(
      'Hotelbeds credentials are missing. Check your .env file.'
    );
    error.statusCode = 500;
    throw error;
  }

  return { apiKey, apiSecret };
}

function generateSignature(apiKey, apiSecret) {
  const timestamp = Math.floor(Date.now() / 1000).toString();

  return crypto
    .createHash('sha256')
    .update(`${apiKey}${apiSecret}${timestamp}`)
    .digest('hex');
}

async function hotelbedsGet(endpoint, params = {}) {
  const { apiKey, apiSecret } = getCredentials();
  const signature = generateSignature(apiKey, apiSecret);

  const url =
    `${BASE_URL}/hotel-content-api/${API_VERSION}${endpoint}`;

  try {
    const response = await axios.get(url, {
      params,
      timeout: 30000,
      headers: {
        'Api-key': apiKey,
        'X-Signature': signature,
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
      },
    });

    return response.data;
  } catch (error) {
    const upstreamStatus = error.response?.status;
    const upstreamData = error.response?.data;

    console.error('Hotelbeds request failed:', {
      endpoint,
      status: upstreamStatus || null,
      providerResponse: upstreamData || null,
      code: error.code || null,
    });

    const apiError = new Error(
      upstreamStatus
        ? `Hotelbeds API returned HTTP ${upstreamStatus}`
        : error.code === 'ECONNABORTED'
          ? 'Hotelbeds API request timed out.'
          : 'Could not connect to Hotelbeds API.'
    );

    apiError.statusCode = upstreamStatus || 502;
    apiError.providerStatus = upstreamStatus || null;
    apiError.details = upstreamData || undefined;

    throw apiError;
  }
}

async function getCountries(options = {}) {
  return hotelbedsGet('/locations/countries', {
    fields: options.fields || 'all',
    language: options.language || 'ENG',
    from: options.from ?? 1,
    to: options.to ?? 100,
  });
}

async function getDestinations(options = {}) {
  return hotelbedsGet('/locations/destinations', {
    fields: options.fields || 'all',
    language: options.language || 'ENG',
    from: options.from ?? 1,
    to: options.to ?? 100,
  });
}

module.exports = {
  hotelbedsGet,
  getCountries,
  getDestinations,
  generateSignature,
};
