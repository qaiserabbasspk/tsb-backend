const Room = require("../../models/rooms");
const RoomProperty = require("../../models/roomProperty");
const Reservation = require("../../models/reservation");
const fs = require("fs");
const { createActivityLog } = require("../../utilities/qbActivityLog_utility");
const { sendEmail } = require("../../utilities/quickbookingEmailer_utility");
const roomsController = require("./rooms");
const { extractRoomIds, summarizeBulkResults } = roomsController._testables;

jest.mock("../../models/rooms");
jest.mock("../../models/roomProperty");
jest.mock("../../models/reservation");
jest.mock("../../utilities/qbActivityLog_utility");
jest.mock("../../utilities/quickbookingEmailer_utility");
jest.mock("fs");

const ADMIN_USER = { id: "admin1", code: "AD1111" };
const HOST_USER = { id: "host1", code: "HO1111" };

function mockRes() {
    return { statusCode: 200, status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), headersSent: false };
}

// Room documents returned by findById need to look like real Mongoose docs:
// deleteOne()/save() as instance methods, and populate() chainable for the
// approve/reject paths that need the host's email.
function fakeRoomDoc(fields) {
    return {
        ...fields,
        id: fields._id,
        save: jest.fn().mockImplementation(function () { return Promise.resolve(this); }),
        deleteOne: jest.fn().mockResolvedValue(undefined),
        populate: jest.fn().mockImplementation(function () { return Promise.resolve(this); }),
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    createActivityLog.mockResolvedValue(undefined);
    sendEmail.mockResolvedValue({ status: "success" });
    fs.existsSync.mockReturnValue(false);
    // No blocking reservation unless a test says otherwise.
    Reservation.countDocuments.mockResolvedValue(0);
});

describe("extractRoomIds / summarizeBulkResults", () => {
    test("filters out non-string / empty entries", () => {
        expect(extractRoomIds({ body: { ids: ["a", "", 123, null, "b"] } })).toEqual(["a", "b"]);
    });

    test("missing or non-array ids body yields an empty list", () => {
        expect(extractRoomIds({ body: {} })).toEqual([]);
        expect(extractRoomIds({ body: { ids: "not-an-array" } })).toEqual([]);
    });

    test("splits ok/not-ok results into succeeded/failed", () => {
        const results = [
            { id: "a", ok: true },
            { id: "b", ok: false, error: "Not found" },
        ];
        expect(summarizeBulkResults(results)).toEqual({
            succeeded: ["a"],
            deactivated: [],
            failed: [{ id: "b", error: "Not found" }],
        });
    });
});

describe("bulkApprove", () => {
    test("admin approves multiple rooms, reports all as succeeded", async () => {
        const rooms = {
            room1: fakeRoomDoc({ _id: "room1", code: "RO0001", title: "A", host: { email: "a@x.com" } }),
            room2: fakeRoomDoc({ _id: "room2", code: "RO0002", title: "B", host: { email: "b@x.com" } }),
        };
        Room.findById.mockImplementation((id) => rooms[id]);

        const req = { user: ADMIN_USER, body: { ids: ["room1", "room2"] } };
        const res = mockRes();
        await roomsController.bulkApprove(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.succeeded).toEqual(["room1", "room2"]);
        expect(payload.failed).toEqual([]);
        expect(rooms.room1.reviewStatus).toBe("approved");
        expect(rooms.room2.reviewStatus).toBe("approved");
        expect(createActivityLog).toHaveBeenCalledTimes(2);
    });

    test("a room that no longer exists is reported in failed without aborting the batch", async () => {
        const room1 = fakeRoomDoc({ _id: "room1", code: "RO0001", title: "A" });
        // Real Mongoose findById() returns a chainable Query even when the
        // doc doesn't exist — .populate() only resolves to null after await,
        // it never throws. Mimic that shape here rather than returning null
        // directly, which would make .populate() throw before this ever
        // reaches the real "not found" branch under test.
        Room.findById.mockImplementation((id) =>
            id === "room1" ? room1 : { populate: jest.fn().mockResolvedValue(null) }
        );

        const req = { user: ADMIN_USER, body: { ids: ["room1", "missing"] } };
        const res = mockRes();
        await roomsController.bulkApprove(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.succeeded).toEqual(["room1"]);
        expect(payload.failed).toEqual([{ id: "missing", error: expect.anything() }]);
    });

    test("non-admin caller is rejected before touching the database", async () => {
        const req = { user: HOST_USER, body: { ids: ["room1"] } };
        const res = mockRes();
        await roomsController.bulkApprove(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(Room.findById).not.toHaveBeenCalled();
    });

    test("empty ids list is rejected", async () => {
        const req = { user: ADMIN_USER, body: { ids: [] } };
        const res = mockRes();
        await roomsController.bulkApprove(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    test("more than the batch cap is rejected", async () => {
        const req = { user: ADMIN_USER, body: { ids: Array.from({ length: 101 }, (_, i) => `room${i}`) } };
        const res = mockRes();
        await roomsController.bulkApprove(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(Room.findById).not.toHaveBeenCalled();
    });
});

describe("bulkReject", () => {
    test("admin rejects multiple rooms with one shared reason", async () => {
        const rooms = {
            room1: fakeRoomDoc({ _id: "room1", code: "RO0001", title: "A", host: { email: "a@x.com" } }),
            room2: fakeRoomDoc({ _id: "room2", code: "RO0002", title: "B", host: { email: "b@x.com" } }),
        };
        Room.findById.mockImplementation((id) => rooms[id]);

        const req = { user: ADMIN_USER, body: { ids: ["room1", "room2"], reason: "Photos are low quality." } };
        const res = mockRes();
        await roomsController.bulkReject(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.succeeded).toEqual(["room1", "room2"]);
        expect(rooms.room1.rejectionReason).toBe("Photos are low quality.");
        expect(rooms.room2.rejectionReason).toBe("Photos are low quality.");
    });

    test("missing reason is rejected", async () => {
        const req = { user: ADMIN_USER, body: { ids: ["room1"] } };
        const res = mockRes();
        await roomsController.bulkReject(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(Room.findById).not.toHaveBeenCalled();
    });
});

describe("bulkPublish", () => {
    test("admin re-publishes multiple unpublished rooms", async () => {
        const rooms = {
            room1: fakeRoomDoc({ _id: "room1", code: "RO0001", title: "A", reviewStatus: "unpublished", host: { email: "a@x.com" } }),
            room2: fakeRoomDoc({ _id: "room2", code: "RO0002", title: "B", reviewStatus: "unpublished", host: { email: "b@x.com" } }),
        };
        Room.findById.mockImplementation((id) => rooms[id]);

        const req = { user: ADMIN_USER, body: { ids: ["room1", "room2"] } };
        const res = mockRes();
        await roomsController.bulkPublish(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.succeeded).toEqual(["room1", "room2"]);
        expect(rooms.room1.reviewStatus).toBe("approved");
        expect(rooms.room2.reviewStatus).toBe("approved");
    });

    test("a room that isn't currently unpublished is reported in failed without aborting the batch", async () => {
        const rooms = {
            room1: fakeRoomDoc({ _id: "room1", code: "RO0001", reviewStatus: "unpublished", host: {} }),
            room2: fakeRoomDoc({ _id: "room2", code: "RO0002", reviewStatus: "pending", host: {} }),
        };
        Room.findById.mockImplementation((id) => rooms[id]);

        const req = { user: ADMIN_USER, body: { ids: ["room1", "room2"] } };
        const res = mockRes();
        await roomsController.bulkPublish(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.succeeded).toEqual(["room1"]);
        expect(payload.failed).toEqual([{ id: "room2", error: expect.anything() }]);
    });

    test("non-admin caller is rejected before touching the database", async () => {
        const req = { user: HOST_USER, body: { ids: ["room1"] } };
        const res = mockRes();
        await roomsController.bulkPublish(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(Room.findById).not.toHaveBeenCalled();
    });
});

describe("bulkUnpublish", () => {
    test("admin unpublishes multiple approved rooms with an optional shared reason", async () => {
        const rooms = {
            room1: fakeRoomDoc({ _id: "room1", code: "RO0001", title: "A", reviewStatus: "approved", host: { email: "a@x.com" } }),
            room2: fakeRoomDoc({ _id: "room2", code: "RO0002", title: "B", reviewStatus: "approved", host: { email: "b@x.com" } }),
        };
        Room.findById.mockImplementation((id) => rooms[id]);

        const req = { user: ADMIN_USER, body: { ids: ["room1", "room2"], reason: "Under review by ops." } };
        const res = mockRes();
        await roomsController.bulkUnpublish(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.succeeded).toEqual(["room1", "room2"]);
        expect(rooms.room1.reviewStatus).toBe("unpublished");
        expect(rooms.room1.unpublishReason).toBe("Under review by ops.");
        expect(rooms.room2.reviewStatus).toBe("unpublished");
    });

    test("a room that isn't currently approved is reported in failed without aborting the batch", async () => {
        const rooms = {
            room1: fakeRoomDoc({ _id: "room1", code: "RO0001", reviewStatus: "approved", host: {} }),
            room2: fakeRoomDoc({ _id: "room2", code: "RO0002", reviewStatus: "pending", host: {} }),
        };
        Room.findById.mockImplementation((id) => rooms[id]);

        const req = { user: ADMIN_USER, body: { ids: ["room1", "room2"] } };
        const res = mockRes();
        await roomsController.bulkUnpublish(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.succeeded).toEqual(["room1"]);
        expect(payload.failed).toEqual([{ id: "room2", error: expect.anything() }]);
    });

    test("notifyHost:false skips the host email", async () => {
        const rooms = {
            room1: fakeRoomDoc({ _id: "room1", code: "RO0001", reviewStatus: "approved", host: { email: "a@x.com" } }),
        };
        Room.findById.mockImplementation((id) => rooms[id]);

        const req = { user: ADMIN_USER, body: { ids: ["room1"], notifyHost: false } };
        const res = mockRes();
        await roomsController.bulkUnpublish(req, res);

        expect(sendEmail).not.toHaveBeenCalled();
    });
});

describe("bulkDelete", () => {
    test("admin deletes multiple rooms (hard delete) and cleans up an emptied property", async () => {
        const room1 = fakeRoomDoc({ _id: "room1", code: "RO0001", propertyId: "prop1" });
        Room.findById.mockImplementation((id) => (id === "room1" ? room1 : null));
        Room.countDocuments.mockResolvedValue(0);
        RoomProperty.deleteOne.mockResolvedValue(undefined);

        const req = {
            user: ADMIN_USER,
            body: { ids: ["room1"], actionBy: ADMIN_USER.code },
            query: {},
        };
        const res = mockRes();
        await roomsController.bulkDelete(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.succeeded).toEqual(["room1"]);
        expect(room1.deleteOne).toHaveBeenCalled();
        expect(RoomProperty.deleteOne).toHaveBeenCalledWith({ _id: "prop1" });
    });

    test("deleteEmptyProperty=false skips the property cascade", async () => {
        const room1 = fakeRoomDoc({ _id: "room1", code: "RO0001", propertyId: "prop1" });
        Room.findById.mockImplementation((id) => (id === "room1" ? room1 : null));
        Room.countDocuments.mockResolvedValue(0);

        const req = {
            user: ADMIN_USER,
            body: { ids: ["room1"] },
            query: { deleteEmptyProperty: "false" },
        };
        const res = mockRes();
        await roomsController.bulkDelete(req, res);

        expect(RoomProperty.deleteOne).not.toHaveBeenCalled();
    });

    test("host deleting their own room soft-deletes instead of destroying it", async () => {
        const room1 = fakeRoomDoc({ _id: "room1", code: "RO0001", hostId: HOST_USER.id });
        Room.findById.mockImplementation((id) => (id === "room1" ? room1 : null));

        const req = { user: HOST_USER, body: { ids: ["room1"] }, query: {} };
        const res = mockRes();
        await roomsController.bulkDelete(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.succeeded).toEqual(["room1"]);
        expect(room1.deleteOne).not.toHaveBeenCalled();
        expect(room1.isDeleted).toBe(true);
        expect(room1.deletedBy).toBe(HOST_USER.code);
    });

    test("host can't delete a room they don't own", async () => {
        const room1 = fakeRoomDoc({ _id: "room1", code: "RO0001", hostId: "someone-else" });
        Room.findById.mockImplementation((id) => (id === "room1" ? room1 : null));

        const req = { user: HOST_USER, body: { ids: ["room1"] }, query: {} };
        const res = mockRes();
        await roomsController.bulkDelete(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.succeeded).toEqual([]);
        expect(payload.failed).toEqual([{ id: "room1", error: expect.anything() }]);
        expect(room1.deleteOne).not.toHaveBeenCalled();
        expect(room1.isDeleted).toBeUndefined();
    });

    test("an active reservation blocks a host's delete, deactivating the room instead", async () => {
        const room1 = fakeRoomDoc({ _id: "room1", code: "RO0001", hostId: HOST_USER.id, status: 1 });
        Room.findById.mockImplementation((id) => (id === "room1" ? room1 : null));
        Reservation.countDocuments.mockResolvedValue(1);

        const req = { user: HOST_USER, body: { ids: ["room1"] }, query: {} };
        const res = mockRes();
        await roomsController.bulkDelete(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.succeeded).toEqual([]);
        expect(payload.deactivated).toEqual(["room1"]);
        expect(room1.status).toBe(0);
        expect(room1.isDeleted).toBeFalsy();
        expect(room1.deleteOne).not.toHaveBeenCalled();
        // Locks in that only still-live checkouts count as "active" — a
        // stuck Pending/Checked-In record whose stay is already over must
        // not hold the room hostage forever.
        expect(Reservation.countDocuments).toHaveBeenCalledWith(
            expect.objectContaining({
                roomId: "room1",
                status: { $in: ["Pending", "Checked In"] },
                checkOut: { $gt: expect.any(Date) },
            })
        );
    });

    test("an active reservation blocks an admin's delete outright (no fallback)", async () => {
        const room1 = fakeRoomDoc({ _id: "room1", code: "RO0001" });
        Room.findById.mockImplementation((id) => (id === "room1" ? room1 : null));
        Reservation.countDocuments.mockResolvedValue(1);

        const req = { user: ADMIN_USER, body: { ids: ["room1"] }, query: {} };
        const res = mockRes();
        await roomsController.bulkDelete(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.succeeded).toEqual([]);
        expect(payload.deactivated).toEqual([]);
        expect(payload.failed).toEqual([{ id: "room1", error: expect.anything() }]);
        expect(room1.deleteOne).not.toHaveBeenCalled();
    });

    test("a reservation whose checkout has already passed does not block deletion", async () => {
        const room1 = fakeRoomDoc({ _id: "room1", code: "RO0001", hostId: HOST_USER.id });
        Room.findById.mockImplementation((id) => (id === "room1" ? room1 : null));
        // hasBlockingReservation's own query already excludes expired
        // checkouts server-side (checkOut: {$gt: now}) — a mocked
        // countDocuments resolving 0 here stands in for that, since the
        // query itself isn't executed against a real DB in this test.
        Reservation.countDocuments.mockResolvedValue(0);

        const req = { user: HOST_USER, body: { ids: ["room1"] }, query: {} };
        const res = mockRes();
        await roomsController.bulkDelete(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.succeeded).toEqual(["room1"]);
        expect(room1.isDeleted).toBe(true);
    });
});
