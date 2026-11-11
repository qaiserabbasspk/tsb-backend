const HotDeals = require("../../models/hot-deal");
const Room = require("../../models/rooms");
const { hotDealValidation } = require("../../validations/hot-deal");
const hotDealsController = require("./hotDeals");

jest.mock("../../models/hot-deal");
jest.mock("../../models/rooms");

function mockRes() {
    return { statusCode: 200, status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), headersSent: false };
}

function mockRoomFindById(fields) {
    Room.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(fields) });
}

const adminUser = { code: "AD001" };

beforeEach(() => {
    jest.resetAllMocks();
    HotDeals.findOne.mockResolvedValue(null);
    HotDeals.mockImplementation((fields) => ({
        ...fields,
        save: jest.fn().mockResolvedValue({ ...fields, id: "deal1" }),
    }));
});

describe("hotDeals.create — discount amount", () => {
    test("converts a valid amount to a rounded-up percentage", async () => {
        mockRoomFindById({ hostId: "host1", address: { country: "Nigeria" }, price: 15000 });
        const req = { body: { roomId: "room1", hostId: "host1", discountAmount: 4000 }, user: adminUser };
        const res = mockRes();

        await hotDealsController.create(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const saved = res.json.mock.calls[0][0];
        // 4000 / 15000 = 26.67% -> rounded up to 27% for display, but the
        // exact amount is what's actually stored/charged.
        expect(saved.discountPercent).toBe(27);
        expect(saved.discountAmount).toBe(4000);
    });

    test("rejects an amount greater than the room's price", async () => {
        mockRoomFindById({ hostId: "host1", address: {}, price: 10000 });
        const req = { body: { roomId: "room1", hostId: "host1", discountAmount: 12000 }, user: adminUser };
        const res = mockRes();

        await hotDealsController.create(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(HotDeals).not.toHaveBeenCalled();
    });

    test("rejects when the room has no price set", async () => {
        mockRoomFindById({ hostId: "host1", address: {}, price: 0 });
        const req = { body: { roomId: "room1", hostId: "host1", discountAmount: 10 }, user: adminUser };
        const res = mockRes();

        await hotDealsController.create(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(HotDeals).not.toHaveBeenCalled();
    });

    test("an amount equal to the room's price is a full 100% discount", async () => {
        mockRoomFindById({ hostId: "host1", address: {}, price: 5000 });
        const req = { body: { roomId: "room1", hostId: "host1", discountAmount: 5000 }, user: adminUser };
        const res = mockRes();

        await hotDealsController.create(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].discountPercent).toBe(100);
    });

    test("a plain percentage still works unchanged", async () => {
        mockRoomFindById({ hostId: "host1", address: {}, price: 15000 });
        const req = { body: { roomId: "room1", hostId: "host1", discountPercent: 25 }, user: adminUser };
        const res = mockRes();

        await hotDealsController.create(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].discountPercent).toBe(25);
        expect(res.json.mock.calls[0][0].discountAmount).toBeUndefined();
    });
});

describe("hotDealValidation", () => {
    test("rejects when both discountPercent and discountAmount are given", () => {
        const { error } = hotDealValidation({ roomId: "r1", hostId: "h1", discountPercent: 10, discountAmount: 100 });
        expect(error).toBeDefined();
    });

    test("rejects when neither is given", () => {
        const { error } = hotDealValidation({ roomId: "r1", hostId: "h1" });
        expect(error).toBeDefined();
    });

    test("accepts discountAmount alone", () => {
        const { error } = hotDealValidation({ roomId: "r1", hostId: "h1", discountAmount: 500 });
        expect(error).toBeUndefined();
    });

    test("rejects a negative discountAmount", () => {
        const { error } = hotDealValidation({ roomId: "r1", hostId: "h1", discountAmount: -5 });
        expect(error).toBeDefined();
    });
});
