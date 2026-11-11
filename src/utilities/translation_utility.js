const axios = require("axios");

/** Placeholder values that mean a key has not actually been set. */
const PLACEHOLDER_KEYS = new Set(["", "your-google-translate-api-key"]);

/** True when a real Google Cloud Translation API key is configured. */
function isGoogleTranslateConfigured() {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();
  return !!key && !PLACEHOLDER_KEYS.has(key);
}

/**
 * Translates a single string via Google Cloud Translation API (v2, Basic -
 * API-key auth, no service account/OAuth needed). Returns null (never the
 * original text mislabeled as a translation) when not configured or on any
 * API failure - callers must fall back to the source-language field, never
 * silently pass untranslated text off as translated.
 */
async function translateText(text, targetLocale, sourceLocale = "en") {
  if (!text || !text.trim()) return null;

  const key = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();
  if (!isGoogleTranslateConfigured()) return null;

  try {
    const res = await axios.post(
      `https://translation.googleapis.com/language/translate/v2?key=${key}`,
      { q: text, source: sourceLocale, target: targetLocale, format: "text" },
      { timeout: 10000 }
    );

    const translated = res.data?.data?.translations?.[0]?.translatedText;
    return typeof translated === "string" && translated.trim() ? translated : null;
  } catch (err) {
    console.error("[Translate] request failed:", err.response?.data || err.message);
    return null;
  }
}

/**
 * Translates a Room's guest-facing text fields. Returns null if translation
 * isn't configured or any field fails - a partial translation (e.g. title
 * translated but description silently left in English with no indication)
 * would be a worse guest experience than falling back to the full English
 * original everywhere, which the caller already does when this returns null.
 */
async function translateRoomFields(room, targetLocale) {
  if (!isGoogleTranslateConfigured()) return null;

  const [title, subtitle, description] = await Promise.all([
    translateText(room.title, targetLocale),
    translateText(room.subtitle, targetLocale),
    translateText(room.description, targetLocale),
  ]);

  if (room.title && !title) return null;
  if (room.subtitle && !subtitle) return null;
  if (room.description && !description) return null;

  return { title, subtitle, description };
}

module.exports = { isGoogleTranslateConfigured, translateText, translateRoomFields };
