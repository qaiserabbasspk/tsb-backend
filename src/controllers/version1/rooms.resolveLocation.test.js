const { buildExactCityMatchQuery } = require("./rooms")._testables;

// Regression guard for the "Lagos" bug: resolveLocation() used to run a
// single shared, capped (.limit(50)) substring-candidate query for every
// match tier (city/area/street/district all in one $or), so a city name
// that also happens to appear inside another city's street/area text (e.g.
// Ibadan's "Lagos Bye Pass" road vs the actual city "Lagos") could crowd
// every real city-matching document out of that capped pool before the
// city-exact check ever saw one. buildExactCityMatchQuery is now checked
// first, as its own dedicated, uncapped query — these tests lock in its
// exact shape so that can't quietly regress back to a shared/capped query.
describe("buildExactCityMatchQuery", () => {
    test("without a country: status/visibility + anchored, case-insensitive city regex only", () => {
        const query = buildExactCityMatchQuery("Lagos", "");

        expect(query).toEqual({
            $and: [
                { status: 1 },
                {
                    $and: [
                        { $or: [{ reviewStatus: "approved" }, { reviewStatus: { $exists: false } }] },
                        { isDeleted: { $ne: true } },
                    ],
                },
                { "address.city": { $regex: "^Lagos$", $options: "i" } },
            ],
        });
    });

    test("with a country: adds an equally anchored, case-insensitive country regex", () => {
        const query = buildExactCityMatchQuery("Lagos", "Nigeria");

        expect(query.$and).toContainEqual({
            "address.country": { $regex: "^Nigeria$", $options: "i" },
        });
    });

    // The whole point of this query: it must never match "Lagos Bye Pass"
    // (or any other city name embedded inside a longer street/area string)
    // when searching for "Lagos" — only an address.city field that IS
    // "Lagos", start to end.
    test("the city regex is start-to-end anchored, so a superset string can never match", () => {
        const query = buildExactCityMatchQuery("Lagos", "");
        const cityClause = query.$and.find((c) => "address.city" in c);
        const pattern = new RegExp(cityClause["address.city"].$regex, "i");

        expect(pattern.test("Lagos")).toBe(true);
        expect(pattern.test("Lagos Bye Pass")).toBe(false);
        expect(pattern.test("New Lagos")).toBe(false);
    });

    // Regex metacharacters in either the search term or the country param
    // must be treated literally, not as regex syntax — otherwise a term
    // like "Port Harcourt (PH)" could throw or behave unpredictably.
    test("escapes regex-special characters in both the term and the country", () => {
        const query = buildExactCityMatchQuery("Ikeja (GRA)", "Côte d'Ivoire");
        const cityClause = query.$and.find((c) => "address.city" in c);
        const countryClause = query.$and.find((c) => "address.country" in c);

        expect(() => new RegExp(cityClause["address.city"].$regex, "i")).not.toThrow();
        expect(() => new RegExp(countryClause["address.country"].$regex, "i")).not.toThrow();
        expect(new RegExp(cityClause["address.city"].$regex, "i").test("Ikeja (GRA)")).toBe(true);
    });

    test("case-insensitive: matches regardless of the search term's casing", () => {
        const query = buildExactCityMatchQuery("lagos", "");
        const cityClause = query.$and.find((c) => "address.city" in c);
        const pattern = new RegExp(cityClause["address.city"].$regex, cityClause["address.city"].$options);

        expect(pattern.test("Lagos")).toBe(true);
        expect(pattern.test("LAGOS")).toBe(true);
    });
});
