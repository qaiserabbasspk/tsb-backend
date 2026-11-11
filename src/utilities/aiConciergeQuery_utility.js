// Static, deterministic helpers for narrowing the AI Concierge catalog
// BEFORE any OpenAI call — the goal is that the common case (mood tags,
// or free text using ordinary hospitality phrasing) never needs an AI
// call just to figure out what to search for, so the paid model is only
// ever spent on the one step that actually needs judgment: picking the
// best listings from an already-relevant pool and explaining why.

// Canonical search terms this whole module deals in. MOOD_KEYWORDS and the
// SYNONYMS map below both resolve to these — keeping one shared vocabulary
// means a mood tag and a free-text word describing the same thing collapse
// into the same $text search term instead of fragmenting the query.
const MOOD_KEYWORDS = {
    romantic: ["romantic", "couples"],
    family: ["family", "spacious"],
    business: ["business", "wifi"],
    beach: ["beach", "beachfront", "sea view"],
    budget: ["budget"],
    adventure: ["adventure", "outdoor", "nature"],
    quiet: ["quiet", "secluded", "peaceful"],
    party: ["party", "rooftop", "nightlife"],
};

// Guest free text -> canonical term. Multi-word keys are matched as whole
// phrases (checked before single words) so "sea view" resolves as one
// concept instead of the unrelated words "sea" and "view" firing separately.
const SYNONYMS = {
    cheap: "budget",
    affordable: "budget",
    inexpensive: "budget",
    economical: "budget",
    budget: "budget",
    sea: "beach",
    seaside: "beach",
    ocean: "beach",
    beach: "beach",
    oceanfront: "beachfront",
    waterfront: "beachfront",
    beachfront: "beachfront",
    "sea view": "sea view",
    "ocean view": "sea view",
    kids: "family",
    children: "family",
    "child friendly": "family",
    "kid friendly": "family",
    family: "family",
    spacious: "spacious",
    secluded: "quiet",
    peaceful: "quiet",
    tranquil: "quiet",
    isolated: "quiet",
    quiet: "quiet",
    romantic: "romantic",
    honeymoon: "romantic",
    couples: "romantic",
    wifi: "wifi",
    "wi-fi": "wifi",
    internet: "wifi",
    pool: "pool",
    swimming: "pool",
    "swimming pool": "pool",
    parking: "parking",
    pet: "pet friendly",
    "pet friendly": "pet friendly",
    dog: "pet friendly",
    rooftop: "rooftop",
    nightlife: "nightlife",
    party: "party",
    lively: "party",
    balcony: "balcony",
    spa: "spa",
    gym: "gym",
    fitness: "gym",
    business: "business",
    workspace: "business",
    outdoor: "outdoor",
    hiking: "outdoor",
    adventure: "adventure",
    nature: "nature",
};

function normalize(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s'-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// Dictionary/synonym lookup only — no AI, no DB. Longest phrases are
// checked first so a matched phrase is consumed before its component words
// get a chance to match separately.
function extractKeywords(promptText) {
    if (!promptText || !promptText.trim()) {
        return [];
    }

    const normalized = normalize(promptText);
    const found = new Set();
    let remaining = ` ${normalized} `;

    const phraseKeys = Object.keys(SYNONYMS)
        .filter((k) => k.includes(" "))
        .sort((a, b) => b.length - a.length);
    for (const phrase of phraseKeys) {
        const needle = ` ${phrase} `;
        if (remaining.includes(needle)) {
            found.add(SYNONYMS[phrase]);
            remaining = remaining.split(needle).join(" ");
        }
    }

    for (const word of remaining.split(" ").filter(Boolean)) {
        if (SYNONYMS[word]) {
            found.add(SYNONYMS[word]);
        }
    }

    return Array.from(found);
}

// Cheap regex read of explicit numbers the guest already typed — "family of
// 5", "under 100000" — so obvious structured intent doesn't need an AI call
// either. Deliberately conservative: only sets a hint on a clear match.
function extractStructuredHints(promptText) {
    const hints = {};
    if (!promptText) {
        return hints;
    }
    const text = promptText.toLowerCase();

    const guestMatch =
        text.match(/(?:family|group|party) of\s*(\d{1,2})/) ||
        text.match(/(\d{1,2})\s*(?:guests?|people|persons|pax|adults?)/);
    if (guestMatch) {
        const n = parseInt(guestMatch[1], 10);
        if (n > 0 && n <= 50) {
            hints.minGuests = n;
        }
    }

    const priceMatch = text.match(/(?:under|below|less than|budget of|max(?:imum)?)\s*[$₦£€]?\s*([\d,]{2,})/);
    if (priceMatch) {
        const n = parseInt(priceMatch[1].replace(/,/g, ""), 10);
        if (n > 0) {
            hints.maxPrice = n;
        }
    }

    return hints;
}

// Merges mood-derived and free-text-derived keywords into one deduped list
// — the set actually sent to the $text search.
function buildKeywordSet(moods = [], promptText = "") {
    const set = new Set();
    for (const mood of moods) {
        (MOOD_KEYWORDS[mood] || []).forEach((k) => set.add(k));
    }
    extractKeywords(promptText).forEach((k) => set.add(k));
    return Array.from(set);
}

// True only when there's free text the static dictionary couldn't make
// sense of — the one case where an extra (small) AI call to interpret it
// is worth the cost. Mood-only and dictionary-recognized text never hit this.
function needsAiKeywordFallback(promptText, staticKeywords, threshold = 2) {
    return !!(promptText && promptText.trim() && staticKeywords.length < threshold);
}

function buildTextSearchFilter(keywords) {
    if (!keywords || keywords.length === 0) {
        return null;
    }
    return { $text: { $search: keywords.join(" ") } };
}

function buildStructuredHintFilter(hints) {
    const filter = {};
    if (hints?.minGuests) {
        filter.guests = { $gte: hints.minGuests };
    }
    if (hints?.maxPrice) {
        filter.price = { $lte: hints.maxPrice };
    }
    return filter;
}

module.exports = {
    MOOD_KEYWORDS,
    SYNONYMS,
    extractKeywords,
    extractStructuredHints,
    buildKeywordSet,
    needsAiKeywordFallback,
    buildTextSearchFilter,
    buildStructuredHintFilter,
};
