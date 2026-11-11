const Room = require("../../models/rooms");
const { buildSearchTextOr, searchTextMatchesKnownPlace } = require("./rooms")._testables;

jest.mock("../../models/rooms");

beforeEach(() => {
    jest.resetAllMocks();
});

describe("searchTextMatchesKnownPlace", () => {
    test("true when the term matches a real address.country or address.city", async () => {
        Room.exists.mockResolvedValue({ _id: "someRoom" });

        const result = await searchTextMatchesKnownPlace("Lagos");

        expect(result).toBe(true);
        expect(Room.exists).toHaveBeenCalledWith({
            $or: [
                { "address.country": { $regex: "Lagos", $options: "i" } },
                { "address.city": { $regex: "Lagos", $options: "i" } },
            ],
        });
    });

    test("false when the term matches no country/city in the catalog", async () => {
        Room.exists.mockResolvedValue(null);

        const result = await searchTextMatchesKnownPlace("London");

        expect(result).toBe(false);
    });
});

describe("buildSearchTextOr", () => {
    test("recognized place search scopes strictly to country/city — no title/subtitle/street", () => {
        const or = buildSearchTextOr("Lagos", true);

        expect(or).toEqual([
            { "address.country": { $regex: "Lagos", $options: "i" } },
            { "address.city": { $regex: "Lagos", $options: "i" } },
        ]);
    });

    test("unrecognized term falls back to the full keyword search across all fields", () => {
        const or = buildSearchTextOr("London", false);

        expect(or).toEqual([
            { title: { $regex: "London", $options: "i" } },
            { subtitle: { $regex: "London", $options: "i" } },
            { "address.street": { $regex: "London", $options: "i" } },
            { "address.city": { $regex: "London", $options: "i" } },
            { "address.country": { $regex: "London", $options: "i" } },
        ]);
    });

    // Regression guard for the exact bug this fix closes: a Lagos listing
    // whose street happens to be named "Osapa London" must not turn a bare
    // "London" search into a broad, unrelated-country-safe-but-still-wrong
    // keyword match. buildSearchTextOr itself can't prevent the street match
    // (that's the disclosed limitation of a free-text box with no resolved
    // country/city — see search()'s own comments) but it must never widen a
    // recognized-place search back out to title/subtitle/street.
    test("a recognized place search never includes address.street, even though the unrecognized fallback does", () => {
        const recognized = buildSearchTextOr("London", true);
        const unrecognized = buildSearchTextOr("London", false);

        expect(recognized.some((clause) => "address.street" in clause)).toBe(false);
        expect(unrecognized.some((clause) => "address.street" in clause)).toBe(true);
    });
});
