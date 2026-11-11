// Confirmed language scope: English (source) + Hausa, Yoruba, Igbo (Nigeria)
// + Twi/Akan (Ghana) + French, Arabic, Chinese (regional/global reach).
// Nigerian Pidgin is explicitly out of scope - not supported by Google Cloud
// Translation API. Keep in sync with quickbooking_ui/src/app/constants/locales.ts
// and the admin app's copy.
const SUPPORTED_LOCALES = [
  "en", "ha", "yo", "ig", "ak", "fr", "ar", "zh",
];

const SOURCE_LOCALE = "en";

function isSupportedLocale(code) {
  return SUPPORTED_LOCALES.includes(String(code || "").trim().toLowerCase());
}

module.exports = { SUPPORTED_LOCALES, SOURCE_LOCALE, isSupportedLocale };
