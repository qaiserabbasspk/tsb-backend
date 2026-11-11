const Room = require("../../models/rooms");
const CheckoutQuote = require("../../models/checkoutQuote");
const currencyUtility = require("../../utilities/currency_utility");
const checkoutQuoteController = require("./checkoutQuote");

jest.mock("../../models/rooms");
jest.mock("../../models/checkoutQuote");
jest.mock("../../utilities/currency_utility");

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), headersSent: false };
}

beforeEach(() => {
    jest.resetAllMocks();
});

describe("checkoutQuote.quote", () => {
    test("freezes a rate for a supported guest currency", async () => {
        Room.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: "room1", currency: "EUR" }) });
        currencyUtility.getRate.mockResolvedValue({ rate: 1.5, fetchedAt: new Date(), stale: false });
        CheckoutQuote.findOneAndUpdate.mockResolvedValue({ rate: 1.5, expiresAt: new Date() });

        const req = { body: { roomId: "a".repeat(24), txRef: "qb-room1-123", guestCurrency: "cad" } };
        const res = mockRes();

        await checkoutQuoteController.quote(req, res);

        expect(currencyUtility.getRate).toHaveBeenCalledWith("EUR", "CAD");
        expect(res.status).toHaveBeenCalledWith(200);
        const payload = res.json.mock.calls[0][0];
        expect(payload.guestCurrency).toBe("CAD");
        expect(payload.usedFallbackCurrency).toBe(false);
    });

    test("falls back to USD when the requested currency isn't supported", async () => {
        Room.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: "room1", currency: "NGN" }) });
        currencyUtility.getRate.mockResolvedValue({ rate: 0.0007, fetchedAt: new Date(), stale: false });
        CheckoutQuote.findOneAndUpdate.mockResolvedValue({ rate: 0.0007, expiresAt: new Date() });

        const req = { body: { roomId: "a".repeat(24), txRef: "qb-room1-123", guestCurrency: "XYZ" } };
        const res = mockRes();

        await checkoutQuoteController.quote(req, res);

        expect(currencyUtility.getRate).toHaveBeenCalledWith("NGN", "USD");
        const payload = res.json.mock.calls[0][0];
        expect(payload.guestCurrency).toBe("USD");
        expect(payload.usedFallbackCurrency).toBe(true);
    });

    test("returns 503 when no rate can be produced even after falling back to USD", async () => {
        Room.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: "room1", currency: "EUR" }) });
        currencyUtility.getRate.mockResolvedValue(null);

        const req = { body: { roomId: "a".repeat(24), txRef: "qb-room1-123", guestCurrency: "CAD" } };
        const res = mockRes();

        await checkoutQuoteController.quote(req, res);

        expect(res.status).toHaveBeenCalledWith(503);
        expect(CheckoutQuote.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test("returns 404 when the room doesn't exist", async () => {
        Room.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

        const req = { body: { roomId: "a".repeat(24), txRef: "qb-room1-123", guestCurrency: "CAD" } };
        const res = mockRes();

        await checkoutQuoteController.quote(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test("returns 400 on invalid input", async () => {
        const req = { body: { roomId: "not-a-valid-id", txRef: "qb-1", guestCurrency: "C" } };
        const res = mockRes();

        await checkoutQuoteController.quote(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(Room.findById).not.toHaveBeenCalled();
    });
});
