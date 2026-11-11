const { getRate } = require("./currency_utility");
const { niceRoundUp, buildCurrencyRateMap, annotateConvertedPrice } = require("./priceConversion_utility");

jest.mock("./currency_utility");

beforeEach(() => {
    jest.resetAllMocks();
});

describe("niceRoundUp", () => {
    test.each([
        [837412, 1000000],
        [42300, 50000],
        [13.4, 20],
        [50000, 50000], // already nice — must not bump up
        [1, 1],
        [0, 0],
        [-5, 0],
    ])("rounds %p up to %p", (input, expected) => {
        expect(niceRoundUp(input)).toBe(expected);
    });
});

describe("buildCurrencyRateMap", () => {
    test("same-currency pairs short-circuit to rate 1 without calling getRate", async () => {
        const map = await buildCurrencyRateMap(["NGN"], "NGN");
        expect(map).toEqual({ NGN: 1 });
        expect(getRate).not.toHaveBeenCalled();
    });

    test("resolves a rate per distinct currency, deduping repeats", async () => {
        getRate.mockImplementation((source, dest) => {
            if (source === "USD" && dest === "NGN") return Promise.resolve({ rate: 1600, stale: false });
            return Promise.resolve(null);
        });

        const map = await buildCurrencyRateMap(["USD", "USD", "GBP", null, ""], "NGN");

        expect(getRate).toHaveBeenCalledTimes(2); // USD once (deduped), GBP once
        expect(map.USD).toBe(1600);
        expect(map.GBP).toBeNull();
    });
});

describe("annotateConvertedPrice", () => {
    test("multiplies by the matching rate", () => {
        const rooms = [{ price: 100, currency: "USD" }, { price: 50000, currency: "NGN" }];
        annotateConvertedPrice(rooms, { USD: 1600, NGN: 1 });
        expect(rooms[0].priceConverted).toBe(160000);
        expect(rooms[1].priceConverted).toBe(50000);
    });

    test("unresolvable currency yields null, not a silent rate of 1", () => {
        const rooms = [{ price: 100, currency: "GBP" }];
        annotateConvertedPrice(rooms, { GBP: null });
        expect(rooms[0].priceConverted).toBeNull();
    });
});
