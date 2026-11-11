const { computeDiscountedNightlyRate } = require("./hotDeal_utility");

describe("computeDiscountedNightlyRate", () => {
    test("no active deal returns the room's own price unchanged", () => {
        expect(computeDiscountedNightlyRate(15000, null)).toBe(15000);
    });

    test("percentage-only deal computes the usual way", () => {
        expect(computeDiscountedNightlyRate(15000, { discountPercent: 25 })).toBe(11250);
    });

    test("an exact discountAmount is used as-is, not re-derived from the rounded-up percent", () => {
        // 4000 / 15000 = 26.67% -> rounds up to 27% for display, but the
        // charge must still be exactly price - 4000, not price * (1 - 0.27).
        const activeDeal = { discountPercent: 27, discountAmount: 4000 };
        expect(computeDiscountedNightlyRate(15000, activeDeal)).toBe(11000);
    });

    test("an amount equal to the price fully zeroes out the nightly rate", () => {
        const activeDeal = { discountPercent: 100, discountAmount: 5000 };
        expect(computeDiscountedNightlyRate(5000, activeDeal)).toBe(0);
    });

    test("a discountAmount of exactly 0 falls back to the percentage path", () => {
        const activeDeal = { discountPercent: 10, discountAmount: 0 };
        expect(computeDiscountedNightlyRate(10000, activeDeal)).toBe(9000);
    });

    test("rounds up to the nearest whole number", () => {
        const activeDeal = { discountPercent: 33 };
        expect(computeDiscountedNightlyRate(100, activeDeal)).toBe(67);
    });

    test("a fractional result rounds up, never down", () => {
        const activeDeal = { discountPercent: 10 };
        expect(computeDiscountedNightlyRate(101, activeDeal)).toBe(91);
    });
});
