
const axios = require('axios');

const baseURL = process.env.GOOGLE_PLACES_BASE_URL || 'https://places.googleapis.com/v1';

function getApiKey() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    const error = new Error(
      'GOOGLE_PLACES_API_KEY is not configured'
    );
    error.status = 500;
    throw error;
  }

  return apiKey;
}

const googlePlacesClient = axios.create({
  baseURL: baseURL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add the key at request time so environment configuration
// is read after dotenv has been initialized.
googlePlacesClient.interceptors.request.use((config) => {
  config.headers['X-Goog-Api-Key'] = getApiKey();
  return config;
});

function clampLimit(value, fallback = 10, maximum = 20) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), maximum);
}

function normalizePlace(place) {
  return {
    placeId: place.id || place.placeId || '',
    name: place.displayName?.text || place.name || '',
    address: place.formattedAddress || place.address || '',
    location: place.location || null,
    primaryType: place.primaryType || null,
    types: place.types || [],
    googleMapsUri: place.googleMapsUri || null,
  };
}


async function autocomplete(input, options = {}) {
  const query = String(input || '').trim();

  if (query.length < 2 || query.length > 200) {
    return [];
  }

  const body = {
    input: query,
    languageCode: options.languageCode || 'en',
    ...(options.regionCode
      ? {
          includedRegionCodes: [
            options.regionCode.toLowerCase(),
          ],
        }
      : {}),
    ...(options.sessionToken
      ? { sessionToken: options.sessionToken }
      : {}),
  };

  const response = await googlePlacesClient.post(
    '/places:autocomplete',
    body,
    {
      headers: {
        'X-Goog-FieldMask': [
          'suggestions.placePrediction.placeId',
          'suggestions.placePrediction.text',
          'suggestions.placePrediction.structuredFormat',
          'suggestions.placePrediction.types',
        ].join(','),
      },
    }
  );

  const suggestions = (response.data.suggestions || [])
    .filter((item) => item.placePrediction)
    .map((item) => {
      const place = item.placePrediction;

      return {
        placeId: place.placeId,
        description: place.text?.text || '',
        mainText:
          place.structuredFormat?.mainText?.text ||
          place.text?.text ||
          '',
        secondaryText:
          place.structuredFormat?.secondaryText?.text || '',
        types: place.types || [],
      };
    });

  // Get latitude and longitude for each suggestion.
  return Promise.all(
    suggestions.map(async (suggestion) => {
      try {
        const details = await getPlaceDetails(
          suggestion.placeId,
          options.languageCode || 'en'
        );

        return {
          ...suggestion,
          latitude: details.location?.latitude ?? null,
          longitude: details.location?.longitude ?? null,
          location: details.location || null,
        };
      } catch (error) {
        console.error(
          'Place details error:',
          error.response?.data || error.message
        );

        return {
          ...suggestion,
          latitude: null,
          longitude: null,
          location: null,
        };
      }
    })
  );
}


async function searchPlaces(query, options = {}) {
  const textQuery = String(query || '').trim();

  if (!textQuery || textQuery.length > 200) {
    return [];
  }

  const body = {
    textQuery,
    languageCode: options.languageCode || 'en',
    maxResultCount: clampLimit(options.limit),
    ...(options.regionCode
      ? { regionCode: options.regionCode.toUpperCase() }
      : {}),
    ...(options.includedType
      ? { includedType: options.includedType }
      : {}),
  };

  const response = await googlePlacesClient.post(
    '/places:searchText',
    body,
    {
      headers: {
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.location',
          'places.primaryType',
          'places.types',
          'places.googleMapsUri',
        ].join(','),
      },
    }
  );

  return (response.data.places || []).map(normalizePlace);
}

async function getPlaceDetails(placeId, languageCode = 'en') {
  if (
    typeof placeId !== 'string' ||
    !/^[A-Za-z0-9_-]+$/.test(placeId)
  ) {
    const error = new Error('A valid placeId is required');
    error.status = 400;
    throw error;
  }

  const response = await googlePlacesClient.get(
    `/places/${encodeURIComponent(placeId)}`,
    {
      params: { languageCode },
      headers: {
        'X-Goog-FieldMask': [
          'id',
          'displayName',
          'formattedAddress',
          'location',
          'types',
          'primaryType',
          'nationalPhoneNumber',
          'internationalPhoneNumber',
          'websiteUri',
          'googleMapsUri',
          'rating',
          'userRatingCount',
          'regularOpeningHours',
        ].join(','),
      },
    }
  );

  const place = response.data;

  return {
    ...normalizePlace(place),
    phone: place.nationalPhoneNumber || null,
    internationalPhone: place.internationalPhoneNumber || null,
    website: place.websiteUri || null,
    rating: place.rating ?? null,
    userRatingCount: place.userRatingCount ?? null,
    openingHours: place.regularOpeningHours || null,
  };
}

async function searchNearby({
  latitude,
  longitude,
  radius = 5000,
  includedTypes = [],
  limit = 10,
}) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const distance = Number(radius);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    const error = new Error('Valid latitude and longitude are required');
    error.status = 400;
    throw error;
  }

  const safeRadius =
    Number.isFinite(distance) && distance > 0
      ? Math.min(distance, 50000)
      : 5000;

  const allowedTypes = Array.isArray(includedTypes)
    ? includedTypes.filter((type) => typeof type === 'string')
    : [];

  const response = await googlePlacesClient.post(
    '/places:searchNearby',
    {
      ...(allowedTypes.length
        ? { includedTypes: allowedTypes }
        : {}),
      maxResultCount: clampLimit(limit),
      locationRestriction: {
        circle: {
          center: {
            latitude: lat,
            longitude: lng,
          },
          radius: safeRadius,
        },
      },
    },
    {
      headers: {
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.location',
          'places.primaryType',
          'places.rating',
          'places.googleMapsUri',
        ].join(','),
      },
    }
  );

  return (response.data.places || []).map((place) => ({
    ...normalizePlace(place),
    rating: place.rating ?? null,
  }));
}

module.exports = {
  autocomplete,
  searchPlaces,
  getPlaceDetails,
  searchNearby,
};
