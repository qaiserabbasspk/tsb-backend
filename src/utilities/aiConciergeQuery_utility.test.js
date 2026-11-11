const {
    extractKeywords,
    extractStructuredHints,
    buildKeywordSet,
    needsAiKeywordFallback,
    buildTextSearchFilter,
    buildStructuredHintFilter,
} = require("./aiConciergeQuery_utility");

describe("extractKeywords", () => {
    test("returns empty array for blank input", () => {
        expect(extractKeywords("")).toEqual([]);
        expect(extractKeywords("   ")).toEqual([]);
        expect(extractKeywords(undefined)).toEqual([]);
    });

    test("matches a single-word synonym to its canonical term", () => {
        expect(extractKeywords("somewhere cheap please")).toEqual(["budget"]);
    });

    test("matches a multi-word phrase as one concept, not its component words", () => {
        const result = extractKeywords("a place with a nice sea view");
        expect(result).toEqual(["sea view"]);
        expect(result).not.toContain("beach");
    });

    test("dedupes repeated concepts and merges multiple matches", () => {
        const result = extractKeywords("cheap and affordable place near the beach with wifi");
        expect(result.sort()).toEqual(["beach", "budget", "wifi"].sort());
    });

    test("ignores words with no dictionary match", () => {
        expect(extractKeywords("somewhere to disconnect from everything")).toEqual([]);
    });

    test("is case-insensitive and tolerates punctuation", () => {
        expect(extractKeywords("QUIET, Secluded place!!")).toEqual(["quiet"]);
    });
});

describe("extractStructuredHints", () => {
    test("returns empty object when nothing matches", () => {
        expect(extractStructuredHints("a nice place to stay")).toEqual({});
        expect(extractStructuredHints("")).toEqual({});
    });

    test("extracts guest count from 'family of N'", () => {
        expect(extractStructuredHints("a place for a family of 5")).toEqual({ minGuests: 5 });
    });

    test("extracts guest count from 'N guests'", () => {
        expect(extractStructuredHints("need room for 4 guests")).toEqual({ minGuests: 4 });
    });

    test("extracts a price ceiling from 'under N'", () => {
        expect(extractStructuredHints("something under 100000 please")).toEqual({ maxPrice: 100000 });
    });

    test("extracts a price ceiling with thousands separators", () => {
        expect(extractStructuredHints("budget of 50,000 naira")).toEqual({ maxPrice: 50000 });
    });

    test("ignores implausible guest counts", () => {
        expect(extractStructuredHints("99 guests")).toEqual({});
    });
});

describe("buildKeywordSet", () => {
    test("pulls static keywords from moods with no free text", () => {
        const result = buildKeywordSet(["quiet"], "");
        expect(result.sort()).toEqual(["peaceful", "quiet", "secluded"].sort());
    });

    test("merges mood keywords with free-text keywords, deduped", () => {
        const result = buildKeywordSet(["beach"], "a quiet beachfront spot");
        expect(new Set(result)).toEqual(new Set(["beach", "beachfront", "sea view", "quiet"]));
    });

    test("returns empty array when neither moods nor text contribute anything", () => {
        expect(buildKeywordSet([], "")).toEqual([]);
    });
});

describe("needsAiKeywordFallback", () => {
    test("false when there is no free text", () => {
        expect(needsAiKeywordFallback("", [])).toBe(false);
        expect(needsAiKeywordFallback("   ", [])).toBe(false);
    });

    test("false when free text is present but static keywords met the threshold", () => {
        expect(needsAiKeywordFallback("cheap and quiet", ["budget", "quiet"])).toBe(false);
    });

    test("true when free text exists but the dictionary found too little", () => {
        expect(needsAiKeywordFallback("somewhere to disconnect from everything", [])).toBe(true);
    });

    test("respects a custom threshold", () => {
        expect(needsAiKeywordFallback("cheap place", ["budget"], 2)).toBe(true);
        expect(needsAiKeywordFallback("cheap place", ["budget"], 1)).toBe(false);
    });
});

describe("buildTextSearchFilter", () => {
    test("returns null for an empty keyword list", () => {
        expect(buildTextSearchFilter([])).toBeNull();
        expect(buildTextSearchFilter(undefined)).toBeNull();
    });

    test("builds a $text filter from keywords", () => {
        expect(buildTextSearchFilter(["beach", "quiet"])).toEqual({ $text: { $search: "beach quiet" } });
    });
});

describe("buildStructuredHintFilter", () => {
    test("returns empty object when no hints given", () => {
        expect(buildStructuredHintFilter({})).toEqual({});
        expect(buildStructuredHintFilter(undefined)).toEqual({});
    });

    test("maps minGuests to a $gte filter", () => {
        expect(buildStructuredHintFilter({ minGuests: 4 })).toEqual({ guests: { $gte: 4 } });
    });

    test("maps maxPrice to a $lte filter", () => {
        expect(buildStructuredHintFilter({ maxPrice: 50000 })).toEqual({ price: { $lte: 50000 } });
    });

    test("combines both hints", () => {
        expect(buildStructuredHintFilter({ minGuests: 2, maxPrice: 20000 })).toEqual({
            guests: { $gte: 2 },
            price: { $lte: 20000 },
        });
    });
});
