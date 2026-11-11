const Host = require("../../models/hosts");
const hostsController = require("./hosts");

jest.mock("../../models/hosts");

const buildRes = () => ({
    statusCode: 200,
    body: undefined,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.body = payload;
        return this;
    },
});

beforeEach(() => {
    jest.resetAllMocks();
});

// Public, guest-facing counterpart to getById (self/admin only, returns
// email/phone/address/bank details) — powers the guest site's /host/:code
// profile page, so it must never leak anything beyond what's already shown
// on a room's host card.
describe("getPublicByCode", () => {
    test("returns only safe fields for an active host, scoped to status only (not isHost — see hosts.js's own comment)", async () => {
        const select = jest.fn().mockResolvedValue({
            id: "abc123",
            code: "HO1234",
            name: "Joshua",
            avatar: "profile_pic.png",
            bio: "Hi there",
            rating: 4.5,
            createdOn: "2026-01-01T00:00:00.000Z",
            email: "joshua@example.com",
            phone: { code: "234", number: 8000000 },
            bankAccount: "0000000000",
            isAdmin: 0,
            isHost: 0,
        });
        Host.findOne.mockReturnValue({ select });

        const req = { params: { code: "HO1234" } };
        const res = buildRes();

        await hostsController.getPublicByCode(req, res);

        expect(Host.findOne).toHaveBeenCalledWith({
            code: "HO1234",
            status: 1,
        });
        expect(select).toHaveBeenCalledWith("code name avatar bio rating createdOn");
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({
            id: "abc123",
            code: "HO1234",
            name: "Joshua",
            avatar: "profile_pic.png",
            bio: "Hi there",
            rating: 4.5,
            createdOn: "2026-01-01T00:00:00.000Z",
        });
        expect(res.body.email).toBeUndefined();
        expect(res.body.phone).toBeUndefined();
        expect(res.body.bankAccount).toBeUndefined();
        expect(res.body.isAdmin).toBeUndefined();
    });

    test("404s for an unknown code", async () => {
        const select = jest.fn().mockResolvedValue(null);
        Host.findOne.mockReturnValue({ select });

        const req = { params: { code: "NOPE" } };
        const res = buildRes();

        await hostsController.getPublicByCode(req, res);

        expect(res.statusCode).toBe(404);
    });
});
