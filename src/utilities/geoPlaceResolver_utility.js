// Resolves a guest's free-text location search (e.g. "Lekki, Lagos",
// "Lagos, Lekki", "lagos lekki", "UK") against a reference list of real
// countries/regions/cities — independent of whether our own catalog has any
// listings there. See rooms.js's searchTextMatchesKnownPlace for why that
// distinction matters: that check answers "do we have inventory here?", not
// "is this a real place?", and conflating the two is what let an unrelated
// search (e.g. "London") silently fall through to a full keyword search and
// coincidentally match a Lagos listing on "Osapa London" street.
//
// Deliberately conservative by design — every rule below exists to prevent
// this resolver from becoming a NEW source of false positives:
//   - Short names (<=4 chars) require an exact match; longer names tolerate
//     only 1-2 edits, scaled by length, so a typo doesn't casually collide
//     with a short, unrelated real place name.
//   - A multi-token search (e.g. "Lekki, Lagos") only resolves if EVERY
//     token matches something real. "Ikeja GRA" must NOT resolve, because
//     "GRA" isn't a place — resolving just "Ikeja" and silently dropping
//     "GRA" would wrongly narrow a search our own keyword search already
//     finds correctly today (see rooms.js's buildSearchTextOr).
//   - An ambiguous match (e.g. "Lagos" existing in both Nigeria and
//     Portugal) is disambiguated by any other matched token's country
//     first, then by population — never left to guess arbitrarily.

// Common abbreviations guests actually type that don't fuzzy-match their
// full name closely enough to resolve on edit distance alone.
const ALIASES = {
  uk: "united kingdom",
  usa: "united states",
  us: "united states",
  uae: "united arab emirates",
};

const TYPE_SPECIFICITY = { city: 3, region: 2, country: 1 };

const normalize = (s) => String(s || "").trim().toLowerCase();

// Plain Levenshtein edit distance (insert/delete/substitute), computed with
// a rolling two-row array rather than a full matrix — these strings are
// short (place names), so this stays fast without needing a dependency.
const editDistance = (a, b) => {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
    }
    prev = curr;
  }
  return prev[n];
};

// How many edits a name of this length may tolerate. Deliberately strict
// for short names — see the module-level doc comment for why.
const editDistanceCap = (len) => {
  if (len <= 4) return 0;
  if (len <= 7) return 1;
  return 2;
};

// Builds an in-memory index from an array of place records (either the real
// GeoPlace collection, loaded once at startup, or a small fixture in tests).
// Groups by exact normalized name for the common case (no typo), plus a
// flat list for the fuzzy fallback scan.
function buildGeoPlaceIndex(places) {
  const byExactName = new Map();
  for (const place of places) {
    const key = normalize(place.asciiName || place.name);
    if (!byExactName.has(key)) byExactName.set(key, []);
    byExactName.get(key).push(place);
  }
  return { all: places, byExactName };
}

// Candidates for a single token: exact-name matches if any exist, otherwise
// the best fuzzy matches within this name-length's edit-distance cap.
function findCandidates(token, index) {
  const normalized = normalize(token);
  if (!normalized) return [];

  const aliased = ALIASES[normalized];
  if (aliased) {
    const exact = index.byExactName.get(aliased);
    if (exact) return exact;
  }

  const exact = index.byExactName.get(normalized);
  if (exact) return exact;

  let best = [];
  let bestDistance = Infinity;
  for (const place of index.all) {
    const name = normalize(place.asciiName || place.name);
    // Cap is based on the CANDIDATE's own (real) name length, not the
    // query's — a deletion typo makes the query shorter than the real
    // name, so capping on the query's length would wrongly under-tolerate.
    const cap = editDistanceCap(name.length);
    if (cap === 0) continue;
    // Cheap pre-filter before paying for the full edit-distance scan.
    if (Math.abs(name.length - normalized.length) > cap) continue;
    const d = editDistance(normalized, name);
    if (d > cap) continue;
    if (d < bestDistance) {
      bestDistance = d;
      best = [place];
    } else if (d === bestDistance) {
      best.push(place);
    }
  }
  return best;
}

// Picks one candidate per ambiguous token, preferring agreement with other
// already-matched tokens' countries, then the most specific type, then the
// largest population.
function disambiguate(candidatesByToken) {
  const otherCountries = new Set();
  for (const candidates of candidatesByToken) {
    if (candidates.length === 1) otherCountries.add(candidates[0].countryCode);
  }

  return candidatesByToken.map((candidates) => {
    if (candidates.length <= 1) return candidates[0] ?? null;
    const scored = candidates.map((c) => ({
      place: c,
      score:
        (otherCountries.has(c.countryCode) ? 1_000_000_000 : 0) +
        (TYPE_SPECIFICITY[c.type] ?? 0) * 1_000_000 +
        (c.population ?? 0),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0].place;
  });
}

// Picks which resolved candidate anchors the result when a search combines
// multiple hierarchy levels (e.g. "Lagos, Lekki"). The anchor is whichever
// candidate is never itself a "container" of another resolved candidate
// (i.e. no other match's regionName/countryName points to it) — the leaf of
// whatever hierarchy the guest described, regardless of the order it was
// typed in or how many levels were given. Falls back to most-specific-type,
// then largest population, when nothing qualifies as a clear leaf (e.g. a
// single-token search with no hierarchy to compare against).
function pickAnchor(resolved) {
  const isContainerOfAnother = (candidate) =>
    resolved.some((other) => {
      if (other === candidate) return false;
      const refs = [other.regionName, other.countryName]
        .filter(Boolean)
        .map(normalize);
      return refs.includes(normalize(candidate.name));
    });

  const leaves = resolved.filter((r) => !isContainerOfAnother(r));
  const pool = leaves.length > 0 ? leaves : resolved;

  return pool.reduce((best, r) => {
    const rSpec = TYPE_SPECIFICITY[r.type] ?? 0;
    const bestSpec = TYPE_SPECIFICITY[best.type] ?? 0;
    if (rSpec > bestSpec) return r;
    if (rSpec === bestSpec && (r.population ?? 0) > (best.population ?? 0)) return r;
    return best;
  });
}

// Tries, in order: the whole string as one token; a comma-split (if commas
// are present and yield 2+ parts); a plain two-word split (only when there
// was no comma, and only for exactly two words — see doc comment on why
// this stays narrow rather than splitting arbitrary N-word phrases).
function candidateTokenSets(searchtext) {
  const trimmed = String(searchtext || "").trim();
  if (!trimmed) return [];

  const sets = [[trimmed]];

  if (trimmed.includes(",")) {
    const parts = trimmed
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) sets.push(parts);
  } else {
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length === 2) sets.push(words);
  }

  return sets;
}

function resolveTokenSet(tokens, index) {
  const candidatesByToken = tokens.map((t) => findCandidates(t, index));
  if (candidatesByToken.some((c) => c.length === 0)) return null;

  const resolved = disambiguate(candidatesByToken);
  if (resolved.some((r) => !r)) return null;

  const anchor = pickAnchor(resolved);

  return {
    recognized: true,
    type: anchor.type,
    city: anchor.type === "city" ? anchor.name : undefined,
    region: anchor.type === "city" ? anchor.regionName : anchor.type === "region" ? anchor.name : undefined,
    country: anchor.countryName,
    // How many independent tokens produced this match — see this field's
    // own doc comment in geoPlaceResolver_utility.test.js for why the
    // search handler treats a single-token match differently from a
    // multi-token one.
    tokenCount: tokens.length,
  };
}

function resolvePlaceSearch(searchtext, index) {
  for (const tokens of candidateTokenSets(searchtext)) {
    const result = resolveTokenSet(tokens, index);
    if (result) return result;
  }
  return { recognized: false };
}

// Cheap live-typeahead classifier for rooms.js's suggest() endpoint: does
// the partial, still-being-typed text already look like the start of a real
// place name? Purely a DISPLAY-ORDER signal (Google's suggestion leads when
// true, ours leads when false) — never used for search scoping, so no
// fuzzy/edit-distance matching here: a partial prefix is inherently
// forgiving already, since the real name only has to START WITH it.
const isKnownPlacePrefix = (rawQuery, index) => {
  const prefix = normalize(rawQuery);
  if (!prefix) return false;
  return index.all.some((place) =>
    normalize(place.asciiName || place.name).startsWith(prefix)
  );
};

// Module-level cache — built once from the GeoPlace collection and reused
// for the life of the process. No TTL: place names don't change on any
// timescale that matters here (see models/geoPlace.js's own doc comment).
// Re-running scripts/importGeoNames.js and restarting the app is how this
// gets refreshed, not an automatic expiry.
let cachedIndexPromise = null;

async function getGeoPlaceIndex() {
  if (!cachedIndexPromise) {
    const GeoPlace = require("../models/geoPlace");
    cachedIndexPromise = GeoPlace.find({})
      .select("type name asciiName countryCode countryName regionName population")
      .lean()
      .then(buildGeoPlaceIndex)
      .catch((err) => {
        // Don't let a DB hiccup permanently poison the cache — the next
        // call gets to try loading again instead of failing forever.
        cachedIndexPromise = null;
        throw err;
      });
  }
  return cachedIndexPromise;
}

module.exports = {
  buildGeoPlaceIndex,
  resolvePlaceSearch,
  isKnownPlacePrefix,
  getGeoPlaceIndex,
  _testables: { editDistance, editDistanceCap, candidateTokenSets },
};
