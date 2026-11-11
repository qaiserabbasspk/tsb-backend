const RoomTranslation = require("../models/roomTranslation");
const translationUtility = require("./translation_utility");
const { getLocalizedRoomFields, ensureRoomTranslation } = require("./roomTranslation_utility");

jest.mock("../models/roomTranslation");
jest.mock("./translation_utility");

const room = {
    _id: "room1",
    title: "Cozy Studio",
    subtitle: "Near the beach",
    description: "A lovely place to stay.",
    updatedOn: new Date("2026-07-01T00:00:00Z"),
};

beforeEach(() => {
    jest.resetAllMocks();
});

describe("getLocalizedRoomFields", () => {
    test("returns English fields unchanged for the source locale", async () => {
        const result = await getLocalizedRoomFields(room, "en");
        expect(result).toEqual({ title: room.title, subtitle: room.subtitle, description: room.description });
        expect(RoomTranslation.findOne).not.toHaveBeenCalled();
    });

    test("falls back to English when no translation exists", async () => {
        RoomTranslation.findOne.mockResolvedValue(null);
        const result = await getLocalizedRoomFields(room, "fr");
        expect(result.title).toBe(room.title);
    });

    test("falls back to English when the stored translation is stale", async () => {
        RoomTranslation.findOne.mockResolvedValue({
            title: "Ancien titre",
            subtitle: "Vieux",
            description: "Vieille description",
            sourceUpdatedOn: new Date("2026-06-01T00:00:00Z"), // before room.updatedOn
        });
        const result = await getLocalizedRoomFields(room, "fr");
        expect(result.title).toBe(room.title);
    });

    test("returns the translation when it is fresh", async () => {
        RoomTranslation.findOne.mockResolvedValue({
            title: "Studio confortable",
            subtitle: "Près de la plage",
            description: "Un bel endroit pour séjourner.",
            sourceUpdatedOn: new Date("2026-07-15T00:00:00Z"), // after room.updatedOn
        });
        const result = await getLocalizedRoomFields(room, "fr");
        expect(result.title).toBe("Studio confortable");
    });
});

describe("ensureRoomTranslation", () => {
    test("no-ops when Google Translate is not configured", async () => {
        translationUtility.isGoogleTranslateConfigured.mockReturnValue(false);
        const result = await ensureRoomTranslation(room, "fr");
        expect(result).toBe(false);
        expect(RoomTranslation.findOne).not.toHaveBeenCalled();
    });

    test("skips re-translating when already up to date", async () => {
        translationUtility.isGoogleTranslateConfigured.mockReturnValue(true);
        RoomTranslation.findOne.mockResolvedValue({ sourceUpdatedOn: new Date("2026-07-15T00:00:00Z") });
        const result = await ensureRoomTranslation(room, "fr");
        expect(result).toBe(true);
        expect(translationUtility.translateRoomFields).not.toHaveBeenCalled();
    });

    test("re-translates and upserts when missing", async () => {
        translationUtility.isGoogleTranslateConfigured.mockReturnValue(true);
        RoomTranslation.findOne.mockResolvedValue(null);
        translationUtility.translateRoomFields.mockResolvedValue({
            title: "Studio confortable",
            subtitle: "Près de la plage",
            description: "Un bel endroit pour séjourner.",
        });
        RoomTranslation.findOneAndUpdate.mockResolvedValue({});

        const result = await ensureRoomTranslation(room, "fr");
        expect(result).toBe(true);
        expect(RoomTranslation.findOneAndUpdate).toHaveBeenCalledWith(
            { roomId: room._id, locale: "fr" },
            expect.objectContaining({ title: "Studio confortable" }),
            expect.objectContaining({ upsert: true })
        );
    });

    test("returns false when translation fails", async () => {
        translationUtility.isGoogleTranslateConfigured.mockReturnValue(true);
        RoomTranslation.findOne.mockResolvedValue(null);
        translationUtility.translateRoomFields.mockResolvedValue(null);

        const result = await ensureRoomTranslation(room, "fr");
        expect(result).toBe(false);
        expect(RoomTranslation.findOneAndUpdate).not.toHaveBeenCalled();
    });
});
