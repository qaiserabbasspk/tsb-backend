const RoomTranslation = require("../models/roomTranslation");
const { translateRoomFields, isGoogleTranslateConfigured } = require("./translation_utility");
const { SOURCE_LOCALE } = require("./supportedLocales_utility");

/**
 * Returns the best available text for a room in the requested locale: a
 * fresh translation if one exists, or the source English fields as a
 * fallback - NEVER a blank field or a raw translation key. "Fresh" means the
 * stored translation's sourceUpdatedOn matches the room's current
 * updatedOn; a stale translation (source edited since) still falls back to
 * English rather than showing outdated translated copy silently.
 */
async function getLocalizedRoomFields(room, locale) {
  const englishFields = { title: room.title, subtitle: room.subtitle, description: room.description };
  if (!locale || locale === SOURCE_LOCALE) return englishFields;

  const translation = await RoomTranslation.findOne({ roomId: room._id, locale });
  if (!translation) return englishFields;

  const roomUpdatedOn = room.updatedOn ? new Date(room.updatedOn).getTime() : 0;
  const sourceUpdatedOn = translation.sourceUpdatedOn ? new Date(translation.sourceUpdatedOn).getTime() : 0;
  if (sourceUpdatedOn < roomUpdatedOn) return englishFields;

  return {
    title: translation.title || englishFields.title,
    subtitle: translation.subtitle || englishFields.subtitle,
    description: translation.description || englishFields.description,
  };
}

/**
 * Re-translates a room into one locale if the stored translation is missing
 * or stale, and upserts the result. Never stored as embedded fields on Room
 * itself - Room/Property carry sync markers from the Rentrack integration,
 * so embedding translations risks them being silently wiped on the next
 * sync. No-ops quietly (returns false) when Google Translate isn't
 * configured, so this can be wired into a background job safely before
 * credentials exist.
 */
async function ensureRoomTranslation(room, locale) {
  if (!isGoogleTranslateConfigured()) return false;

  const roomUpdatedOn = room.updatedOn ? new Date(room.updatedOn) : new Date();
  const existing = await RoomTranslation.findOne({ roomId: room._id, locale });
  if (existing && existing.sourceUpdatedOn && existing.sourceUpdatedOn >= roomUpdatedOn) {
    return true; // already up to date
  }

  const translated = await translateRoomFields(room, locale);
  if (!translated) return false;

  await RoomTranslation.findOneAndUpdate(
    { roomId: room._id, locale },
    {
      ...translated,
      sourceUpdatedOn: roomUpdatedOn,
      translatedOn: new Date(),
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return true;
}

module.exports = { getLocalizedRoomFields, ensureRoomTranslation, SOURCE_LOCALE };
