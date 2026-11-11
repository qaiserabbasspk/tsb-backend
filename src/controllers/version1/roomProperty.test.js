const Room = require("../../models/rooms");
const RoomProperty = require("../../models/roomProperty");
const { buildRoomDetailPayload } = require("../../utilities/roomDetailPayload_utility");
const { verify } = require("jsonwebtoken");
const roomPropertyController = require("./roomProperty");

jest.mock("../../models/rooms");
jest.mock("../../models/roomProperty");
jest.mock("../../utilities/roomDetailPayload_utility");
jest.mock("jsonwebtoken");

// statusCode: 200 mirrors Express's real default before .status() is
// called — the controller reads res.statusCode directly on success, same
// as rooms.js's getById.
function mockRes() {
    return { statusCode: 200, status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), headersSent: false };
}

// A room/property "document" needs .populate() (instance method, resolves
// itself) and .toJSON() for the controller's chained calls to work.
function fakeDoc(fields) {
    const doc = {
        ...fields,
        id: fields._id,
        populate: jest.fn().mockResolvedValue(undefined),
        toJSON: jest.fn().mockReturnValue({ ...fields, id: fields._id }),
    };
    return doc;
}

// Room.findById is used two different ways in the controller: awaited
// directly (`const room = await Room.findById(id)`, in getDetail) and query-
// chained (`await Room.findById(id).populate(opts)`, inside
// respondWithPropertyDetail, to fetch the fully-populated selected room).
// This wrapper is thenable (so a direct `await` resolves straight to `doc`,
// which then exposes its own real `.populate` for the synthetic-property
// path) AND exposes a `.populate()` that resolves to the same `doc` (for the
// chained case).
function findByIdResult(doc) {
    return {
        populate: jest.fn().mockResolvedValue(doc),
        then: (resolve) => resolve(doc),
    };
}

// Keyed by room id so the same mock serves both the initial lookup in
// getDetail and the later re-lookup of the selected room in
// respondWithPropertyDetail, which is very often the same id.
function mockRoomFindById(docsById) {
    Room.findById.mockImplementation((id) => findByIdResult(docsById[id] ?? null));
}

function mockRoomFindChain(rooms) {
    Room.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
            sort: jest.fn().mockResolvedValue(rooms),
        }),
    });
}

beforeEach(() => {
    jest.resetAllMocks();
    buildRoomDetailPayload.mockImplementation(async (room) => ({ ...room, richDetail: true }));
});

describe("roomProperty.getDetail", () => {
    test("id is a property: selects the cheapest room by default", async () => {
        const property = fakeDoc({ _id: "prop1", hostId: "hostA" });
        RoomProperty.findById.mockResolvedValue(property);
        const cheap = fakeDoc({ _id: "roomCheap", price: 50, reviewStatus: "approved" });
        const pricey = fakeDoc({ _id: "roomPricey", price: 200, reviewStatus: "approved" });
        mockRoomFindChain([cheap, pricey]); // already sorted ascending by the query
        mockRoomFindById({ roomCheap: cheap });

        const req = { params: { id: "prop1" }, query: {}, user: undefined };
        const res = mockRes();

        await roomPropertyController.getDetail(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const payload = res.json.mock.calls[0][0];
        expect(payload.selectedRoom.id).toBe("roomCheap");
        expect(payload.otherRooms).toHaveLength(1);
        expect(payload.otherRooms[0].id).toBe("roomPricey");
    });

    test("id is a legacy room id: resolves to its property and selects that exact room", async () => {
        RoomProperty.findById
            .mockResolvedValueOnce(null) // idParam isn't a property
            .mockResolvedValueOnce(fakeDoc({ _id: "prop1", hostId: "hostA" })); // room.propertyId lookup
        const targetRoom = fakeDoc({ _id: "roomB", price: 200, reviewStatus: "approved", propertyId: "prop1", hostId: "hostA" });
        const cheaper = fakeDoc({ _id: "roomA", price: 50, reviewStatus: "approved" });
        mockRoomFindById({ roomB: targetRoom });
        mockRoomFindChain([cheaper, targetRoom]); // cheapest still first in the list

        const req = { params: { id: "roomB" }, query: {}, user: undefined };
        const res = mockRes();

        await roomPropertyController.getDetail(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.selectedRoom.id).toBe("roomB");
        expect(payload.otherRooms).toHaveLength(1);
        expect(payload.otherRooms[0].id).toBe("roomA");
    });

    test("neither a property nor a room exists for the id: 404", async () => {
        RoomProperty.findById.mockResolvedValue(null);
        mockRoomFindById({});

        const req = { params: { id: "missing" }, query: {}, user: undefined };
        const res = mockRes();

        await roomPropertyController.getDetail(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test("a room with no propertyId becomes its own synthetic single-room property", async () => {
        RoomProperty.findById.mockResolvedValue(null);
        const orphanRoom = fakeDoc({ _id: "roomX", title: "Solo Unit", reviewStatus: "approved", propertyId: undefined });
        mockRoomFindById({ roomX: orphanRoom });

        const req = { params: { id: "roomX" }, query: {}, user: undefined };
        const res = mockRes();

        await roomPropertyController.getDetail(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const payload = res.json.mock.calls[0][0];
        expect(payload.selectedRoom.id).toBe("roomX");
        expect(payload.otherRooms).toEqual([]);
        expect(RoomProperty.findById).toHaveBeenCalledTimes(1); // never looked up a property a second time
        expect(orphanRoom.populate).toHaveBeenCalled(); // fully populated for its own rich detail
    });

    test("an unapproved room the requester can't view: 404, and the property's rooms are never even queried", async () => {
        RoomProperty.findById.mockResolvedValue(null);
        const pendingRoom = fakeDoc({ _id: "roomY", reviewStatus: "pending", hostId: "hostA", propertyId: "prop1" });
        mockRoomFindById({ roomY: pendingRoom });

        const req = { params: { id: "roomY" }, query: {}, user: undefined };
        const res = mockRes();

        await roomPropertyController.getDetail(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(Room.find).not.toHaveBeenCalled();
    });

    test("a preview-authorized unapproved room stays selected instead of falling back to an approved room", async () => {
        RoomProperty.findById
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(fakeDoc({ _id: "prop1", hostId: "hostA" }));
        const pendingRoom = fakeDoc({ _id: "roomPending", price: 300, reviewStatus: "pending", hostId: "hostA", propertyId: "prop1" });
        mockRoomFindById({ roomPending: pendingRoom });
        verify.mockReturnValue({ type: "roomPreview", roomId: "roomPending" });

        const approvedCheap = fakeDoc({ _id: "roomApproved", price: 50, reviewStatus: "approved" });
        // The pending room must be included here — proves the $or guard in
        // respondWithPropertyDetail actually widened the query, not just that
        // the controller "remembers" the id.
        mockRoomFindChain([approvedCheap, pendingRoom]);

        const req = { params: { id: "roomPending" }, query: { preview: "sometoken" }, user: undefined };
        const res = mockRes();

        await roomPropertyController.getDetail(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const payload = res.json.mock.calls[0][0];
        expect(payload.selectedRoom.id).toBe("roomPending");
        expect(payload.otherRooms).toHaveLength(1);
        expect(payload.otherRooms[0].id).toBe("roomApproved");
    });
});
