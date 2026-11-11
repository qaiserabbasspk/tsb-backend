
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
    throw new Error(
      'Missing HOTELBEDS_API_KEY or HOTELBEDS_API_SECRET in .env'
    );
  }

  return { apiKey, apiSecret };
}

function generateSignature() {
  const { apiKey, apiSecret } = getCredentials();

  const timestamp = Math.floor(Date.now() / 1000);

  return crypto
    .createHash('sha256')
    .update(`${apiKey}${apiSecret}${timestamp}`)
    .digest('hex');
}

function buildHeaders() {
  const { apiKey } = getCredentials();

  return {
    'Api-key': apiKey,
    'X-Signature': generateSignature(),
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip'
  };
}

/**
 * Get hotels from Hotelbeds Content API.
 *
 * Supported filters:
 * destinationCode, countryCode, codes, includeHotels,
 * fields, language, from, to, useSecondaryLanguage,
 * lastUpdateTime, PMSRoomCode
 */
async function getHotels(filters = {}) {
  const url =
    `${BASE_URL}/hotel-content-api/${API_VERSION}/hotels`;

  const params = {};

  const allowedParams = [
    'destinationCode',
    'countryCode',
    'includeHotels',
    'fields',
    'language',
    'from',
    'to',
    'useSecondaryLanguage',
    'lastUpdateTime',
    'PMSRoomCode'
  ];

  for (const key of allowedParams) {
    const value = filters[key];

    if (value !== undefined && value !== null && value !== '') {
      params[key] = value;
    }
  }

  // Hotel codes can be supplied as an array of integers.
  if (filters.codes !== undefined && filters.codes !== null) {
    const codes = Array.isArray(filters.codes)
      ? filters.codes
      : [filters.codes];

    if (
      codes.some(code =>
        !Number.isInteger(Number(code)) ||
        Number(code) <= 0
      )
    ) {
      throw new Error(
        'codes must contain positive integer hotel codes'
      );
    }

    params.codes = codes.map(Number);
  }

  // Defaults for pagination.
  params.from ??= 1;
  params.to ??= 100;

  if (
    !Number.isInteger(Number(params.from)) ||
    !Number.isInteger(Number(params.to)) ||
    Number(params.from) < 1 ||
    Number(params.to) < Number(params.from)
  ) {
    throw new Error('Invalid pagination: check from and to');
  }

  params.from = Number(params.from);
  params.to = Number(params.to);

  if (params.fields === undefined) {
    // Omit fields to let Hotelbeds return its default field set.
  }

  try {
    const response = await axios.get(url, {
      headers: buildHeaders(),
      params,
      timeout: 30000,
      paramsSerializer: {
        serialize(query) {
          const searchParams = new URLSearchParams();

          for (const [key, value] of Object.entries(query)) {
            if (Array.isArray(value)) {
              value.forEach(item => {
                searchParams.append(key, String(item));
              });
            } else {
              searchParams.append(key, String(value));
            }
          }

          return searchParams.toString();
        }
      }
    });

    return response.data;
  } catch (error) {
    const status = error.response?.status;
    const data = error.response?.data;

    console.error('Hotelbeds Content API request failed:', {
      status,
      data: data ?? error.message
    });

    const apiError = new Error(
      data?.error?.message ||
      data?.message ||
      error.message ||
      'Hotelbeds request failed'
    );

    apiError.status = status || 502;
    apiError.details = data;

    throw apiError;
  }
}

module.exports = {
  getHotels,
  generateSignature
};
