const { getCountries, getDestinations } = require("./hotelbedsservice");

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

// Stores promises so simultaneous searches share one download.
const cache = {};

function extractArray(response, key) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.[key])) return response[key];
  return [];
}

function getName(item) {
  const name = item?.name ?? item?.description;

  if (typeof name === "string") return name;
  return name?.content || "";
}

async function downloadAll(fetcher, key, options) {
  const all = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE + 1;
    const to = from + PAGE_SIZE - 1;

    const response = await fetcher({
      language: options.language,
      fields: options.fields,
      from,
      to,
    });

    const items = extractArray(response, key);
    all.push(...items);

    if (items.length < PAGE_SIZE) break;
  }

  return all;
}

function fetchAll(fetcher, key, options) {
  const cacheKey = `${key}:${options.language || "ENG"}`;
  const cached = cache[cacheKey];

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.promise;
  }

  const promise = downloadAll(fetcher, key, options).catch((error) => {
    // Do not keep failed requests in the cache.
    delete cache[cacheKey];
    throw error;
  });

  cache[cacheKey] = { promise, at: Date.now() };
  return promise;
}

function rank(name, q) {
  const n = name.toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  return 2;
}

async function searchLocations(query, options = {}) {
  const q = String(query || "")
    .trim()
    .toLowerCase();

  if (q.length < 2) {
    return {
      countries: [],
      destinations: [],
      results: [],
      meta: { total: 0 },
    };
  }

  const responses = await Promise.allSettled([
    fetchAll(getCountries, "countries", options),
    fetchAll(getDestinations, "destinations", options),
  ]);

  const countriesData =
    responses[0].status === "fulfilled" ? responses[0].value : null;
  const destinationsData =
    responses[1].status === "fulfilled" ? responses[1].value : null;

  if (!countriesData && !destinationsData) {
    const error = new Error(
      "Unable to search countries and destinations from Hotelbeds.",
    );
    error.statusCode = 502;
    error.providerErrors = responses.map((result, index) => ({
      endpoint: index === 0 ? "countries" : "destinations",
      status: result.reason?.providerStatus || null,
      message: result.reason?.message || "Request failed",
    }));
    throw error;
  }

  const countries = countriesData || [];
  const destinations = destinationsData || [];

  const matchedCountries = countries
    .filter((country) => {
      const name = getName(country).toLowerCase();
      const code = String(country.code || country.isoCode || "").toLowerCase();

      return name.includes(q) || code === q;
    })
    .map((country) => ({
      type: "country",
      code: country.code || country.isoCode || "",
      name: getName(country),
      countryCode: country.code || country.isoCode || "",
      label: getName(country),
    }))
    .sort((a, b) => rank(a.name, q) - rank(b.name, q));

  const matchedDestinations = destinations
    .filter((destination) => {
      const name = getName(destination).toLowerCase();
      const code = String(destination.code || "").toLowerCase();
      const countryCode = String(
        destination.countryCode || destination.isoCode || "",
      ).toLowerCase();

      return name.includes(q) || code === q || countryCode === q;
    })
    .map((destination) => ({
      type: "destination",
      code: destination.code || "",
      name: getName(destination),
      countryCode: destination.countryCode || destination.isoCode || "",
      label: [
        getName(destination),
        destination.countryCode || destination.isoCode || "",
      ]
        .filter(Boolean)
        .join(", "),
    }))
    .sort((a, b) => rank(a.name, q) - rank(b.name, q));

  const limit = options.limit || 20;

  // Countries first, followed by matching destinations.
  const results = [...matchedCountries, ...matchedDestinations].slice(0, limit);

  return {
    countries: matchedCountries.slice(0, limit),
    destinations: matchedDestinations.slice(0, limit),
    results,
    meta: {
      total: results.length,
      partial: !countriesData || !destinationsData,
      errors: responses.flatMap((result, index) =>
        result.status === "rejected"
          ? [
              {
                endpoint: index === 0 ? "countries" : "destinations",
                status: result.reason?.providerStatus || null,
              },
            ]
          : [],
      ),
    },
  };
}

module.exports = {
  searchLocations,
};