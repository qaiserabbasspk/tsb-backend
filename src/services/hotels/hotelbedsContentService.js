const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = (
  process.env.HOTELBEDS_BASE_URL ||
  'https://api.test.hotelbeds.com'
).replace(/\/+$/, '');

const API_VERSION = process.env.HOTELBEDS_API_VERSION || '1.0';
// const CONTENT_URL = `${BASE_URL}/hotel-content-api/${API_VERSION}`;
const CONTENT_URL = `${BASE_URL}/hotel-content-api/${API_VERSION}`;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
 * Shared GET helper: fresh signature on every call, repeated-key array
 * serialization, optional retry on 429 / 5xx with exponential backoff.
 */
async function request(path, params = {}, { retries = 3 } = {}) {
  const url = `${CONTENT_URL}${path}`;

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await axios.get(url, {
        headers: buildHeaders(), // new signature each attempt
        params,
        timeout: 30000,
        paramsSerializer: {
          serialize(query) {
            const searchParams = new URLSearchParams();

            for (const [key, value] of Object.entries(query)) {
              if (Array.isArray(value)) {
                value.forEach(item => searchParams.append(key, String(item)));
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
      const retryable =
        status === 429 || (status >= 500 && status < 600) || !status;

      if (retryable && attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }

      console.error('Hotelbeds Content API request failed:', {
        path,
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
}

function normalizeCodes(codes) {
  const list = Array.isArray(codes) ? codes : [codes];

  if (list.some(code => !Number.isInteger(Number(code)) || Number(code) <= 0)) {
    throw new Error('codes must contain positive integer hotel codes');
  }

  return list.map(Number);
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

  if (filters.codes !== undefined && filters.codes !== null) {
    params.codes = normalizeCodes(filters.codes);
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

  return request('/hotels', params);
}

/**
 * Get full details for one or many hotel codes.
 * GET /hotels/{hotelCodes}/details
 *
 * Keep each call to a modest number of codes (default batch is 50 in
 * getAllHotelDetails) to avoid very long URLs.
 */
async function getHotelDetails(codes, { language } = {}) {
  const list = normalizeCodes(codes);

  if (list.length === 0) {
    throw new Error('At least one hotel code is required');
  }

  const params = {};
  if (language) params.language = language;

  const data = await request(`/hotels/${list.join(',')}/details`, params);

  // Normalize: API may return a single `hotel` or a `hotels` array.
  if (Array.isArray(data?.hotels)) return data.hotels;
  if (data?.hotel) return [data.hotel];
  return [];
}

/**
 * Page through /hotels and collect EVERY hotel code.
 * Accepts the same filters as getHotels (countryCode, destinationCode, ...).
 * Requests only the `code` field to keep responses small.
 */
async function getAllHotelCodes(filters = {}, { pageSize = 1000, onPage } = {}) {
  const codes = [];
  let from = 1;

  // `codes`, `from`, `to`, `fields` are controlled here.
  const { codes: _c, from: _f, to: _t, fields: _fl, ...rest } = filters;

  while (true) {
    const to = from + pageSize - 1;

    const data = await getHotels({ ...rest, fields: 'code', from, to });

    const hotels = data?.hotels || [];
    const total = data?.total ?? 0;

    for (const hotel of hotels) codes.push(hotel.code);

    if (onPage) onPage({ fetched: codes.length, total });

    if (hotels.length === 0 || to >= total) break;

    from = to + 1;
  }

  return codes;
}

/**
 * Fetch details for a long list of codes in batches.
 * `onBatch(hotels, progress)` is called after each batch so you can save
 * to a DB / file immediately instead of holding everything in memory.
 * If onBatch is omitted, all hotels are collected and returned.
 */
async function getAllHotelDetails(
  codes,
  { language, batchSize = 50, delayMs = 300, onBatch } = {}
) {
  const results = [];

  for (let i = 0; i < codes.length; i += batchSize) {
    const batch = codes.slice(i, i + batchSize);
    const hotels = await getHotelDetails(batch, { language });

    if (onBatch) {
      await onBatch(hotels, {
        done: Math.min(i + batchSize, codes.length),
        total: codes.length
      });
    } else {
      results.push(...hotels);
    }

    if (delayMs) await sleep(delayMs);
  }

  return results;
}

module.exports = {
  getHotels,
  getHotelDetails,
  getAllHotelCodes,
  getAllHotelDetails,
  generateSignature
};