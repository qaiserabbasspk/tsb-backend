const RoomProperty = require("../../models/roomProperty");
const Room = require("../../models/rooms");
const Host = require("../../models/hosts");
const Category = require("../../models/category");
const propertiesDashboardController = require("./propertiesDashboard");
const { looksLikeDuplicate, haversineKm, normalize } = propertiesDashboardController._testables;

jest.mock("../../models/roomProperty");
jest.mock("../../models/rooms");
jest.mock("../../models/hosts");
jest.mock("../../models/category");

const ADMIN_USER = { code: "AD1111" };
const HOST_USER = { code: "HO1111" };

function mockRes() {
    return { statusCode: 200, status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), headersSent: false };
}

// Mimics a chainable Mongoose Query — every method returns the same object
// so any subset of .populate()/.sort()/.skip()/.limit() can be chained in
// any order, with .lean() as the terminal call that resolves the promise.
function chainableQuery(resolvedValue) {
    const query = {
        populate: jest.fn(() => query),
        sort: jest.fn(() => query),
        skip: jest.fn(() => query),
        limit: jest.fn(() => query),
        lean: jest.fn().mockResolvedValue(resolvedValue),
    };
    return query;
}

beforeEach(() => {
    jest.resetAllMocks();
});

describe("_testables", () => {
    describe("normalize", () => {
        test("trims and lowercases", () => {
            expect(normalize("  Ocean View Villa  ")).toBe("ocean view villa");
        });

        test("nullish input yields empty string", () => {
            expect(normalize(undefined)).toBe("");
        });
    });

    describe("haversineKm", () => {
        test("same point is zero distance", () => {
            const p = { latitude: 6.5244, longitude: 3.3792 };
            expect(haversineKm(p, p)).toBeCloseTo(0, 5);
        });

        test("distinct points return a positive distance", () => {
            const a = { latitude: 6.5244, longitude: 3.3792 };
            const b = { latitude: 6.6018, longitude: 3.3515 };
            expect(haversineKm(a, b)).toBeGreaterThan(0);
        });
    });

    describe("looksLikeDuplicate", () => {
        test("same name and matching street text is a duplicate", () => {
            const a = { name: "Ocean View Villa", address: { street: "12 Marina Road", city: "Lagos" } };
            const b = { name: "ocean view villa", address: { street: "12 marina road", city: "Lagos" } };
            expect(looksLikeDuplicate(a, b)).toBe(true);
        });

        test("same name and close coordinates in the same city is a duplicate", () => {
            const a = { name: "Palm Suites", address: { city: "Lagos" }, location: { latitude: 6.5244, longitude: 3.3792 } };
            const b = { name: "Palm Suites", address: { city: "Lagos" }, location: { latitude: 6.5246, longitude: 3.3794 } };
            expect(looksLikeDuplicate(a, b)).toBe(true);
        });

        test("different names never match, regardless of address", () => {
            const a = { name: "Palm Suites", address: { street: "1 Main St", city: "Lagos" } };
            const b = { name: "Ivory Court", address: { street: "1 Main St", city: "Lagos" } };
            expect(looksLikeDuplicate(a, b)).toBe(false);
        });

        test("same name but unrelated address/location is not a duplicate", () => {
            const a = { name: "City Hotel", address: { street: "1 First Ave", city: "Lagos" }, location: { latitude: 6.5244, longitude: 3.3792 } };
            const b = { name: "City Hotel", address: { street: "9 Ninth Close", city: "Abuja" }, location: { latitude: 9.0765, longitude: 7.3986 } };
            expect(looksLikeDuplicate(a, b)).toBe(false);
        });

        test("missing name on either side never matches", () => {
            expect(looksLikeDuplicate({ name: "", address: {} }, { name: "Palm Suites", address: {} })).toBe(false);
        });
    });
});

describe("admin gating", () => {
    const req = { user: HOST_USER, query: {}, body: {} };

    test.each([
        "summary",
        "byCategory",
        "growth",
        "newest",
        "zeroRoom",
        "incomplete",
        "geo",
        "topHosts",
        "duplicates",
    ])("%s rejects a non-admin caller with 403", async (handlerName) => {
        const res = mockRes();
        await propertiesDashboardController[handlerName](req, res);
        expect(res.status).toHaveBeenCalledWith(403);
    });
});

describe("summary", () => {
    test("assembles property and room counts for an admin caller", async () => {
        RoomProperty.countDocuments
            .mockResolvedValueOnce(42) // totalProperties
            .mockResolvedValueOnce(3) // newThisWeek
            .mockResolvedValueOnce(10); // newThisMonth
        Room.countDocuments
            .mockResolvedValueOnce(100) // totalRooms
            .mockResolvedValueOnce(80) // active
            .mockResolvedValueOnce(20) // inactive
            .mockResolvedValueOnce(70) // approved
            .mockResolvedValueOnce(20) // pending
            .mockResolvedValueOnce(10); // rejected
        RoomProperty.distinct.mockResolvedValue(["host1", "host2"]);

        const res = mockRes();
        await propertiesDashboardController.summary({ user: ADMIN_USER, query: {} }, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                totalProperties: 42,
                newThisWeek: 3,
                newThisMonth: 10,
                totalRooms: 100,
                roomStatus: { active: 80, inactive: 20 },
                roomReviewStatus: { approved: 70, pending: 20, rejected: 10 },
                totalHostsWithProperty: 2,
            })
        );
    });
});

describe("duplicates", () => {
    test("flags a matching pair and leaves an unrelated property out", async () => {
        const properties = [
            {
                id: "p1",
                name: "Ocean View Villa",
                address: { street: "12 Marina Road", city: "Lagos" },
                host: { name: "Host A", code: "HO0001" },
            },
            {
                id: "p2",
                name: "Ocean View Villa",
                address: { street: "12 Marina Road", city: "Lagos" },
                host: { name: "Host B", code: "HO0002" },
            },
            {
                id: "p3",
                name: "Mountain Lodge",
                address: { street: "99 Hilltop", city: "Abuja" },
                host: { name: "Host C", code: "HO0003" },
            },
        ];
        RoomProperty.find.mockReturnValue(chainableQuery(properties));

        const res = mockRes();
        await propertiesDashboardController.duplicates({ user: ADMIN_USER, query: {} }, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.pairs).toHaveLength(1);
        expect(payload.pairs[0].map((p) => p.id).sort()).toEqual(["p1", "p2"]);
    });
});

describe("newest", () => {
    test("paginates and shapes properties latest-first", async () => {
        RoomProperty.countDocuments.mockResolvedValue(1);
        const properties = [
            {
                id: "p1",
                name: "Ocean View Villa",
                address: { city: "Lagos" },
                categoryId: "cat1",
                host: { name: "Host A" },
                rooms: [{ _id: "r1" }, { _id: "r2" }],
                createdOn: new Date("2026-08-15"),
            },
        ];
        RoomProperty.find.mockReturnValue(chainableQuery(properties));

        const res = mockRes();
        await propertiesDashboardController.newest({ user: ADMIN_USER, query: { page: "1", pageSize: "10" } }, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.data).toEqual([
            expect.objectContaining({ id: "p1", name: "Ocean View Villa", hostName: "Host A", roomCount: 2 }),
        ]);
    });
});
