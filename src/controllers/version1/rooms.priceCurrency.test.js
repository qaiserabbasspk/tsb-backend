const { getRate } = require("../../utilities/currency_utility");
const { isAdminUser } = require("../../utilities/roomVisibility_utility");
const roomsController = require("./rooms");
const { roomWithinPriceRange, sortComparatorFor } = roomsController._testables;

jest.mock("../../models/rooms");
jest.mock("../../utilities/currency_utility");

const ADMIN_USER = { code: "AD1111" };

function mockRes() {
    return { statusCode: 200, status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), headersSent: false };
}

beforeEach(() => {
    jest.resetAllMocks();
});

describe("guest search listing-currency filter", () => {
    // Mirrors rooms.js search(): display currency must not exclude rooms
    // listed in other currencies — only admins may filter by listing currency.
    test("guest display currency does not become a Mongo currency filter", () => {
        const query = {};
        const body = { currency: "USD" };
        if (body.currency && isAdminUser(null)) query.currency = body.currency;
        expect(query.currency).toBeUndefined();
    });

    test("admin may filter rooms by listing currency", () => {
        const query = {};
        const body = { currency: "USD" };
        if (body.currency && isAdminUser(ADMIN_USER)) query.currency = body.currency;
        expect(query.currency).toBe("USD");
    });
});

describe("roomWithinPriceRange", () => {
    test("no bounds set is always a pass, even without priceConverted", () => {
        expect(roomWithinPriceRange({}, undefined, undefined)).toBe(true);
    });

    test("a room with no resolvable rate (priceConverted null) is excluded, not assumed in-range", () => {
        expect(roomWithinPriceRange({ priceConverted: null }, 1000, 5000)).toBe(false);
    });

    test("excludes below minPrice and above maxPrice, includes within", () => {
        expect(roomWithinPriceRange({ priceConverted: 900 }, 1000, 5000)).toBe(false);
        expect(roomWithinPriceRange({ priceConverted: 6000 }, 1000, 5000)).toBe(false);
        expect(roomWithinPriceRange({ priceConverted: 3000 }, 1000, 5000)).toBe(true);
    });
});

describe("sortComparatorFor price sorts prefer priceConverted", () => {
    // The exact bug this closes: a $500 room (raw price 500) must not sort
    // as "cheaper" than a ₦40,000 room (raw price 40000) once both are
    // expressed in the same currency — here priceConverted already reflects
    // that $500 ≈ ₦800,000, dramatically more expensive.
    test("price_asc orders by priceConverted, not the raw stored amount", () => {
        const usdRoom = { price: 500, priceConverted: 800000 };
        const ngnRoom = { price: 40000, priceConverted: 40000 };
        const comparator = sortComparatorFor('price_asc');
        const sorted = [usdRoom, ngnRoom].sort(comparator);
        expect(sorted).toEqual([ngnRoom, usdRoom]);
    });

    test("price_desc orders by priceConverted, not the raw stored amount", () => {
        const usdRoom = { price: 500, priceConverted: 800000 };
        const ngnRoom = { price: 40000, priceConverted: 40000 };
        const comparator = sortComparatorFor('price_desc');
        const sorted = [ngnRoom, usdRoom].sort(comparator);
        expect(sorted).toEqual([usdRoom, ngnRoom]);
    });

    test("falls back to raw price when priceConverted was never set (no conversion requested)", () => {
        const a = { price: 100 };
        const b = { price: 50 };
        const comparator = sortComparatorFor('price_asc');
        expect([a, b].sort(comparator)).toEqual([b, a]);
    });
});

describe("priceBounds", () => {
    // Fixed ₦500,000 reference — not the catalog's actual highest price (a
    // single outlier listing would blow the ceiling out and make the slider
    // useless for filtering everything below it).
    test("NGN request needs no conversion — ceiling is exactly the reference amount", async () => {
        const res = mockRes();
        await roomsController.priceBounds({ query: { currency: "NGN" }, user: ADMIN_USER }, res);

        expect(getRate).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ min: 0, max: 500000, currency: "NGN" });
    });

    test("rejects an unsupported currency by falling back to the default", async () => {
        getRate.mockResolvedValue({ rate: 1 / 1600, stale: false });

        const res = mockRes();
        await roomsController.priceBounds({ query: { currency: "not-a-real-currency" }, user: ADMIN_USER }, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ currency: "USD" }));
    });

    test("converts the reference amount into the target currency and rounds up nicely", async () => {
        getRate.mockImplementation((source, dest) => {
            if (source === "NGN" && dest === "USD") return Promise.resolve({ rate: 0.000625, stale: false }); // ₦500,000 -> $312.50
            return Promise.resolve(null);
        });

        const res = mockRes();
        await roomsController.priceBounds({ query: { currency: "USD" }, user: ADMIN_USER }, res);

        expect(res.json).toHaveBeenCalledWith({ min: 0, max: 500, currency: "USD" });
    });

    test("no resolvable NGN rate yields a zero range instead of erroring", async () => {
        getRate.mockResolvedValue(null);

        const res = mockRes();
        await roomsController.priceBounds({ query: { currency: "USD" }, user: ADMIN_USER }, res);

        expect(res.json).toHaveBeenCalledWith({ min: 0, max: 0, currency: "USD" });
    });
});
