const Room = require("../../models/rooms");
const RoomProperty = require("../../models/roomProperty");
const Reservation = require("../../models/reservation");
const BlockedDate = require("../../models/blockedDates");
const Host = require("../../models/hosts");
const roomsController = require("./rooms");
const {
    buildAdminRoomFilterQuery,
    adminSortFor,
    computeFullyBookedRoomIds,
} = roomsController._testables;

jest.mock("../../models/rooms");
jest.mock("../../models/roomProperty");
jest.mock("../../models/reservation");
jest.mock("../../models/blockedDates");
jest.mock("../../models/hosts");

beforeEach(() => {
    jest.resetAllMocks();
    process.env.DEFAULT_PAGE = "1";
    process.env.DEFAULT_PAGESIZE = "10";
});

function mockRes() {
    return { statusCode: 200, status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), headersSent: false };
}

// Mirrors the real Room model: `id` is always derived from the room's own
// `_id`, never from `propertyId` — the exact invariant this whole test file
// exists to guard.
function fakeRoomDoc(fields) {
    return {
        ...fields,
        id: fields._id,
        toJSON: jest.fn().mockReturnValue({ ...fields, id: fields._id }),
    };
}

function mockRoomFindChain(rooms) {
    Room.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
                skip: jest.fn().mockReturnValue({
                    limit: jest.fn().mockResolvedValue(rooms),
                }),
            }),
        }),
    });
}

describe("buildAdminRoomFilterQuery", () => {
    test("empty query produces no filter", () => {
        expect(buildAdminRoomFilterQuery({})).toEqual({});
    });

    test("category, country/city (case-insensitive, exact-match, regex-escaped), capacity minimums, price range, review status", () => {
        const query = buildAdminRoomFilterQuery({
            categoryId: "cat1",
            country: "Nigeria (West)",
            city: "Lagos",
            guests: "2",
            bedroom: "1",
            bed: "1",
            bath: "1",
            minPrice: "1000",
            maxPrice: "5000",
            reviewStatus: "pending",
        });

        expect(query.categoryId).toBe("cat1");
        expect(query["address.country"]).toEqual({ $regex: "^Nigeria \\(West\\)$", $options: "i" });
        expect(query["address.city"]).toEqual({ $regex: "^Lagos$", $options: "i" });
        expect(query.guests).toEqual({ $gte: 2 });
        expect(query.bedroom).toEqual({ $gte: 1 });
        expect(query.bed).toEqual({ $gte: 1 });
        expect(query.bath).toEqual({ $gte: 1 });
        expect(query.price).toEqual({ $gte: 1000, $lte: 5000 });
        expect(query.reviewStatus).toBe("pending");
    });

    test("0/empty values are treated as no filter (matches the admin form's unset defaults)", () => {
        const query = buildAdminRoomFilterQuery({ guests: "0", bedroom: 0, minPrice: "", maxPrice: undefined });
        expect(query.guests).toBeUndefined();
        expect(query.bedroom).toBeUndefined();
        expect(query.price).toBeUndefined();
    });

    test("only minPrice set still produces a valid range (no $lte)", () => {
        const query = buildAdminRoomFilterQuery({ minPrice: "1000" });
        expect(query.price).toEqual({ $gte: 1000 });
    });
});

describe("adminSortFor", () => {
    test.each([
        ["price_asc", { price: 1 }],
        ["price_desc", { price: -1 }],
        ["title_asc", { title: 1 }],
        ["title_desc", { title: -1 }],
        ["createdOn_desc", { createdOn: -1 }],
        ["createdOn_asc", { createdOn: 1 }],
        ["updatedOn_desc", { updatedOn: -1 }],
        ["code_asc", { code: 1 }],
        ["rating_desc", { rating: -1 }],
        ["guests_asc", { guests: 1 }],
        ["bedroom_asc", { bedroom: 1 }],
        ["bed_asc", { bed: 1 }],
        ["bath_asc", { bath: 1 }],
        ["status_desc", { status: -1 }],
        ["reviewStatus_asc", { reviewStatus: 1 }],
        ["city_asc", { "address.city": 1 }],
        ["country_desc", { "address.country": -1 }],
        [undefined, { _id: -1 }],
        ["something_unrecognized", { _id: -1 }],
        ["category_asc", { _id: -1 }],
    ])("%s -> %o", (sortBy, expected) => {
        expect(adminSortFor(sortBy)).toEqual(expected);
    });
});

describe("computeFullyBookedRoomIds", () => {
    test("a room whose reservations meet its quantity is excluded", async () => {
        Reservation.aggregate.mockResolvedValue([{ _id: "room1", bookedUnits: 2 }]);
        BlockedDate.aggregate.mockResolvedValue([]);
        Room.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ _id: "room1", quantity: 2 }]) });

        const result = await computeFullyBookedRoomIds("2026-09-01", "2026-09-03");

        expect(result).toEqual(["room1"]);
    });

    test("a room with remaining capacity is not excluded", async () => {
        Reservation.aggregate.mockResolvedValue([{ _id: "room1", bookedUnits: 1 }]);
        BlockedDate.aggregate.mockResolvedValue([]);
        Room.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ _id: "room1", quantity: 3 }]) });

        const result = await computeFullyBookedRoomIds("2026-09-01", "2026-09-03");

        expect(result).toEqual([]);
    });

    test("blocked dates stack with reservations toward the same capacity", async () => {
        Reservation.aggregate.mockResolvedValue([{ _id: "room1", bookedUnits: 1 }]);
        BlockedDate.aggregate.mockResolvedValue([{ _id: "room1", blockedUnits: 1 }]);
        Room.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ _id: "room1", quantity: 2 }]) });

        const result = await computeFullyBookedRoomIds("2026-09-01", "2026-09-03");

        expect(result).toEqual(["room1"]);
    });

    test("no bookings or blocks at all short-circuits without querying Room", async () => {
        Reservation.aggregate.mockResolvedValue([]);
        BlockedDate.aggregate.mockResolvedValue([]);

        const result = await computeFullyBookedRoomIds("2026-09-01", "2026-09-03");

        expect(result).toEqual([]);
        expect(Room.find).not.toHaveBeenCalled();
    });
});

// Regression coverage for the actual production bug: admin's Search/Apply
// Filter used to route through the guest-facing property-grouped search,
// which sets `id` to the *property's* id — every Edit/Delete on a searched
// room then sent the wrong id and the backend correctly (but confusingly)
// replied "Record Not Found". getAllForAdmin must always return each room's
// own id, with or without filters applied, full stop.
describe("getAllForAdmin — room id integrity", () => {
    const ADMIN_USER = { code: "AD1111" };

    test("returns the room's own id, not its propertyId, with no filters", async () => {
        const room = fakeRoomDoc({
            _id: "room1",
            code: "RO0001",
            title: "Cozy roomm",
            propertyId: "prop1",
            price: 5,
        });
        Room.countDocuments.mockResolvedValue(1);
        mockRoomFindChain([room]);
        RoomProperty.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ id: "prop1", name: "Cozy roomm" }]) });

        const req = { user: ADMIN_USER, query: { page: "1", pageSize: "10" } };
        const res = mockRes();
        await roomsController.getAllForAdmin(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.data[0].id).toBe("room1");
        expect(payload.data[0].id).not.toBe("prop1");
        expect(payload.data[0].propertyName).toBe("Cozy roomm");
    });

    test("still returns the room's own id when a structured filter (category/price/etc.) is applied", async () => {
        const room = fakeRoomDoc({
            _id: "room1",
            code: "RO0001",
            title: "Delux Room",
            propertyId: "prop2",
            categoryId: "cat1",
            price: 100,
        });
        Room.countDocuments.mockResolvedValue(1);
        mockRoomFindChain([room]);
        RoomProperty.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ id: "prop2", name: "Delux Room" }]) });

        const req = {
            user: ADMIN_USER,
            query: { page: "1", pageSize: "10", categoryId: "cat1", minPrice: "50", maxPrice: "200" },
        };
        const res = mockRes();
        await roomsController.getAllForAdmin(req, res);

        expect(Room.countDocuments).toHaveBeenCalledWith(
            expect.objectContaining({ categoryId: "cat1", price: { $gte: 50, $lte: 200 } })
        );
        const payload = res.json.mock.calls[0][0];
        expect(payload.data[0].id).toBe("room1");
    });

    test("still returns the room's own id when a free-text search matches the room via its property's name", async () => {
        // The exact reproduction: searching "Cozy roomm" (a property name)
        // must resolve back to the room's own id, not the property's.
        const room = fakeRoomDoc({
            _id: "room1",
            code: "RO0001",
            title: "Cozy roomm",
            propertyId: "prop1",
            price: 5,
        });
        Room.countDocuments.mockResolvedValue(1);
        mockRoomFindChain([room]);
        RoomProperty.find.mockImplementation((filter) => {
            // buildAdminRoomSearchFilter's own property-name lookup
            if (filter?.name) {
                return { select: jest.fn().mockResolvedValue([{ _id: "prop1" }]) };
            }
            // attachPropertyNames' lookup
            return { select: jest.fn().mockResolvedValue([{ id: "prop1", name: "Cozy roomm" }]) };
        });

        const req = { user: ADMIN_USER, query: { page: "1", pageSize: "10", search: "Cozy roomm" } };
        const res = mockRes();
        await roomsController.getAllForAdmin(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.data[0].id).toBe("room1");
        expect(payload.data[0].id).not.toBe("prop1");
    });

    test("non-admin caller is rejected before touching the database", async () => {
        const req = { user: { code: "HO1111" }, query: {} };
        const res = mockRes();

        await roomsController.getAllForAdmin(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(Room.find).not.toHaveBeenCalled();
    });
});

describe("getByHost — room id integrity", () => {
    test("still returns the room's own id when the host applies a structured filter", async () => {
        Host.findOne.mockResolvedValue({ id: "host1", code: "HO1111" });
        const room = fakeRoomDoc({
            _id: "room1",
            code: "RO0001",
            title: "Delux Room",
            propertyId: "prop2",
            hostId: "host1",
            bedroom: 2,
        });
        Room.countDocuments.mockResolvedValue(1);
        mockRoomFindChain([room]);
        RoomProperty.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ id: "prop2", name: "Delux Room" }]) });

        const req = {
            user: { id: "host1", code: "HO1111" },
            params: { code: "HO1111" },
            query: { page: "1", pageSize: "10", bedroom: "1" },
        };
        const res = mockRes();
        await roomsController.getByHost(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.data[0].id).toBe("room1");
    });
});
