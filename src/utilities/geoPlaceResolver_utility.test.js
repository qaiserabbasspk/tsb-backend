const { resolvePlaceSearch, buildGeoPlaceIndex, isKnownPlacePrefix } = require("./geoPlaceResolver_utility");

// Small, hand-crafted fixture — deliberately includes the Lagos/Nigeria vs
// Lagos/Portugal name collision (flaw #1) and a short, typo-prone region
// name ("Oyo", flaw #2). Kept tiny and deterministic rather than loading the
// real ~54k-row GeoNames import, so these tests never depend on network
// access or the actual dataset's contents.
const FIXTURE_PLACES = [
  { type: "country", name: "Nigeria", asciiName: "nigeria", countryCode: "NG", countryName: "Nigeria", population: 200000000 },
  { type: "country", name: "Portugal", asciiName: "portugal", countryCode: "PT", countryName: "Portugal", population: 10000000 },
  { type: "country", name: "United Kingdom", asciiName: "united kingdom", countryCode: "GB", countryName: "United Kingdom", population: 67000000 },
  { type: "region", name: "Lagos", asciiName: "lagos", countryCode: "NG", countryName: "Nigeria", population: 15000000 },
  { type: "region", name: "Oyo", asciiName: "oyo", countryCode: "NG", countryName: "Nigeria", population: 7800000 },
  { type: "city", name: "Lagos", asciiName: "lagos", countryCode: "NG", countryName: "Nigeria", regionName: "Lagos", population: 15000000 },
  { type: "city", name: "Lagos", asciiName: "lagos", countryCode: "PT", countryName: "Portugal", regionName: "Faro", population: 31000 },
  { type: "city", name: "Lekki", asciiName: "lekki", countryCode: "NG", countryName: "Nigeria", regionName: "Lagos", population: 200000 },
  { type: "city", name: "Ikeja", asciiName: "ikeja", countryCode: "NG", countryName: "Nigeria", regionName: "Lagos", population: 313000 },
  { type: "city", name: "Port Harcourt", asciiName: "port harcourt", countryCode: "NG", countryName: "Nigeria", regionName: "Rivers", population: 1865000 },
  { type: "city", name: "London", asciiName: "london", countryCode: "GB", countryName: "United Kingdom", regionName: "England", population: 8900000 },
  // Third London — smaller than the UK one — proves the population tiebreak
  // holds up with more than two colliding countries, not just the Lagos pair.
  { type: "country", name: "Canada", asciiName: "canada", countryCode: "CA", countryName: "Canada", population: 38000000 },
  { type: "region", name: "Ontario", asciiName: "ontario", countryCode: "CA", countryName: "Canada", population: 14000000 },
  { type: "city", name: "London", asciiName: "london", countryCode: "CA", countryName: "Canada", regionName: "Ontario", population: 400000 },
];

const index = buildGeoPlaceIndex(FIXTURE_PLACES);

describe("resolvePlaceSearch — rearrangement / order-independence", () => {
  test.each([
    "Lekki, Lagos",
    "Lagos, Lekki",
    "Nigeria, Lagos, Lekki",
    "Lekki, Nigeria, Lagos",
  ])("%s resolves to Lekki, Lagos, Nigeria regardless of order", (term) => {
    const result = resolvePlaceSearch(term, index);
    expect(result.recognized).toBe(true);
    expect(result.type).toBe("city");
    expect(result.city).toBe("Lekki");
    expect(result.region).toBe("Lagos");
    expect(result.country).toBe("Nigeria");
  });
});

describe("resolvePlaceSearch — no-comma phrasing", () => {
  test("space-separated 'lagos lekki' with no comma still combines", () => {
    const result = resolvePlaceSearch("lagos lekki", index);
    expect(result.recognized).toBe(true);
    expect(result.city).toBe("Lekki");
    expect(result.country).toBe("Nigeria");
  });

  test("a legitimate two-word city name with no comma resolves as one place", () => {
    const result = resolvePlaceSearch("Port Harcourt", index);
    expect(result.recognized).toBe(true);
    expect(result.type).toBe("city");
    expect(result.city).toBe("Port Harcourt");
    expect(result.country).toBe("Nigeria");
  });
});

describe("resolvePlaceSearch — case-insensitivity", () => {
  test.each(["LEKKI, lagos", "lekki LAGOS", "lEkKi, LaGoS"])(
    "%s resolves regardless of case",
    (term) => {
      const result = resolvePlaceSearch(term, index);
      expect(result.recognized).toBe(true);
      expect(result.city).toBe("Lekki");
    }
  );
});

describe("resolvePlaceSearch — small typo tolerance scaled by word length", () => {
  test("one missing letter in a 5-letter city name still resolves", () => {
    const result = resolvePlaceSearch("Leki, Lagos", index);
    expect(result.recognized).toBe(true);
    expect(result.city).toBe("Lekki");
  });

  test("one extra letter in a 5-letter city name still resolves", () => {
    const result = resolvePlaceSearch("Ikeeja, Lagos", index);
    expect(result.recognized).toBe(true);
    expect(result.city).toBe("Ikeja");
  });

  test("a 1-letter-off short (<=4 char) region name does NOT resolve — too risky to guess", () => {
    const result = resolvePlaceSearch("Oyi", index);
    expect(result.recognized).toBe(false);
  });

  test("the exact short region name still resolves", () => {
    const result = resolvePlaceSearch("Oyo", index);
    expect(result.recognized).toBe(true);
    expect(result.type).toBe("region");
    expect(result.region).toBe("Oyo");
    expect(result.country).toBe("Nigeria");
  });
});

describe("resolvePlaceSearch — cross-country name collision", () => {
  test("bare 'Lagos' resolves to Lagos, Nigeria (far more populous), not Lagos, Portugal", () => {
    const result = resolvePlaceSearch("Lagos", index);
    expect(result.recognized).toBe(true);
    expect(result.country).toBe("Nigeria");
  });

  test("a Lagos context token still disambiguates correctly via the other matched token", () => {
    const result = resolvePlaceSearch("Lagos, Lekki", index);
    expect(result.recognized).toBe(true);
    expect(result.country).toBe("Nigeria");
  });
});

describe("resolvePlaceSearch — real place we simply have no listings for", () => {
  test("'London' resolves as a genuine place (UK), for the caller to scope the query — not a false 'unrecognized'", () => {
    const result = resolvePlaceSearch("London", index);
    expect(result.recognized).toBe(true);
    expect(result.type).toBe("city");
    expect(result.city).toBe("London");
    expect(result.country).toBe("United Kingdom");
  });
});

describe("resolvePlaceSearch — must not hijack a search our own catalog already finds correctly", () => {
  test("'Ikeja GRA' does not resolve — GRA isn't a real place, so this must fall through to keyword search", () => {
    const result = resolvePlaceSearch("Ikeja GRA", index);
    expect(result.recognized).toBe(false);
  });
});

describe("resolvePlaceSearch — abbreviations", () => {
  test.each(["UK", "uk", "Uk"])("%s resolves to United Kingdom", (term) => {
    const result = resolvePlaceSearch(term, index);
    expect(result.recognized).toBe(true);
    expect(result.type).toBe("country");
    expect(result.country).toBe("United Kingdom");
  });
});

describe("resolvePlaceSearch — garbage input", () => {
  test("a long random string resolves to nothing, without throwing", () => {
    const result = resolvePlaceSearch(
      "Zzzxxqqvvbbnnmmzzzzz Nonexistent Fictional Street 999",
      index
    );
    expect(result.recognized).toBe(false);
  });
});

describe("resolvePlaceSearch — empty / whitespace edge cases", () => {
  test("empty string does not resolve", () => {
    expect(resolvePlaceSearch("", index).recognized).toBe(false);
  });

  test("whitespace-only string does not resolve", () => {
    expect(resolvePlaceSearch("   ", index).recognized).toBe(false);
  });

  test("a trailing comma with an empty segment is tolerated", () => {
    const result = resolvePlaceSearch("Lekki, Lagos, ", index);
    expect(result.recognized).toBe(true);
    expect(result.city).toBe("Lekki");
  });

  test("does not throw for null/undefined input", () => {
    expect(resolvePlaceSearch(null, index).recognized).toBe(false);
    expect(resolvePlaceSearch(undefined, index).recognized).toBe(false);
  });
});

describe("resolvePlaceSearch — three-way country collision", () => {
  test("bare 'London' resolves to London, UK (most populous) over Canada", () => {
    const result = resolvePlaceSearch("London", index);
    expect(result.recognized).toBe(true);
    expect(result.country).toBe("United Kingdom");
  });

  test("'London, Ontario' disambiguates to Canada via the region token", () => {
    const result = resolvePlaceSearch("London, Ontario", index);
    expect(result.recognized).toBe(true);
    expect(result.country).toBe("Canada");
  });
});

// tokenCount tells the caller how many independent tokens produced the
// match — the search handler in rooms.js uses it to decide whether a
// resolution is confident enough for EXCLUSIVE country/city scoping
// (>= 2 tokens: "Lekki, Lagos", "London, UK" — nobody types a full place
// description by accident) vs. a single bare word ("London"), which is
// left to the normal catalog keyword search instead, since it can
// coincidentally collide with real address text elsewhere (e.g. "Osapa
// London" street, Lagos) in a way a multi-part description can't.
describe("resolvePlaceSearch — tokenCount reflects match confidence", () => {
  test("a single bare word has tokenCount 1", () => {
    expect(resolvePlaceSearch("London", index).tokenCount).toBe(1);
  });

  test("a multi-word city name matched as ONE token (no comma) still has tokenCount 1", () => {
    expect(resolvePlaceSearch("Port Harcourt", index).tokenCount).toBe(1);
  });

  test("a comma-separated hierarchy match has tokenCount 2", () => {
    expect(resolvePlaceSearch("Lekki, Lagos", index).tokenCount).toBe(2);
  });

  test("a three-part hierarchy match has tokenCount 3", () => {
    expect(resolvePlaceSearch("Nigeria, Lagos, Lekki", index).tokenCount).toBe(3);
  });
});

// isKnownPlacePrefix — cheap live-typeahead classifier (rooms.js's suggest()
// endpoint): does partial, still-being-typed text already look like the
// start of a real place name? No fuzzy/edit-distance matching needed here —
// unlike resolvePlaceSearch, a partial prefix is inherently forgiving (the
// real name only has to START WITH what's typed so far).
describe("isKnownPlacePrefix", () => {
  test("a real prefix of a known city name is recognized", () => {
    expect(isKnownPlacePrefix("Lon", index)).toBe(true);
  });

  test("a real prefix of a country name is recognized", () => {
    expect(isKnownPlacePrefix("Nige", index)).toBe(true);
  });

  test("matching is case-insensitive", () => {
    expect(isKnownPlacePrefix("lON", index)).toBe(true);
  });

  test("gibberish with no matching prefix is not recognized", () => {
    expect(isKnownPlacePrefix("Zzzxxqq", index)).toBe(false);
  });

  test("empty or whitespace-only input is not recognized", () => {
    expect(isKnownPlacePrefix("", index)).toBe(false);
    expect(isKnownPlacePrefix("   ", index)).toBe(false);
  });

  test("does not throw for null/undefined input", () => {
    expect(isKnownPlacePrefix(null, index)).toBe(false);
    expect(isKnownPlacePrefix(undefined, index)).toBe(false);
  });
});
