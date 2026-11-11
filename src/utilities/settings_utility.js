const SystemSettings = require("../models/systemSettings");

// Defaults preserve original behaviour if the DB is unreachable or empty.
const DEFAULTS = {
    hostEmailVerificationEnabled: true,
    listingReviewEnabled: true,
};

// Small in-memory cache so per-request gates don't hit the DB every time.
let cache = null;
let cachedAt = 0;
const TTL_MS = 60 * 1000;

// Returns the singleton settings document, creating it on first use.
const loadDoc = async () => {
    let doc = await SystemSettings.findOne();
    if (!doc) {
        doc = await SystemSettings.create({});
    }
    return doc;
};

// Cached plain-object read used by the feature gates.
const getSettings = async () => {
    const now = Date.now();
    if (cache && now - cachedAt < TTL_MS) {
        return cache;
    }
    try {
        const doc = await loadDoc();
        cache = {
            hostEmailVerificationEnabled: doc.hostEmailVerificationEnabled,
            listingReviewEnabled: doc.listingReviewEnabled,
        };
        cachedAt = now;
        return cache;
    } catch (err) {
        // Never let a settings lookup break a request — fall back to defaults.
        return { ...DEFAULTS };
    }
};

const invalidate = () => {
    cache = null;
    cachedAt = 0;
};

module.exports = { getSettings, loadDoc, invalidate, DEFAULTS };
