const Host = require("../../models/hosts");
const RoomProperty = require("../../models/roomProperty");
const roomPropertiesController = require("./roomProperties");

jest.mock("../../models/hosts");
jest.mock("../../models/roomProperty");

function mockRes() {
    return { statusCode: 200, status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), headersSent: false };
}

function fakePropertyDoc(fields) {
    return {
        ...fields,
        id: fields._id,
        rooms: fields.rooms ?? [],
        toJSON: jest.fn().mockReturnValue({ ...fields, id: fields._id }),
    };
}

const HOST_USER = { id: "host1", code: "HO1111" };
const OTHER_HOST_USER = { id: "host2", code: "HO2222" };
const ADMIN_USER = { id: "admin1", code: "AD1111" };

beforeEach(() => {
    jest.resetAllMocks();
});

describe("roomProperties.suggest", () => {
    test("host user: returns the nearest same-city property within 0.15km", async () => {
        const near = fakePropertyDoc({
            _id: "propNear",
            hostId: "host1",
            name: "Palm Grove Residences",
            categoryId: "cat1",
            address: { city: "Lagos" },
            location: { latitude: 6.4432, longitude: 3.4726 },
            rooms: [{}, {}, {}],
        });
        const far = fakePropertyDoc({
            _id: "propFar",
            hostId: "host1",
            name: "Riverside Apartments",
            address: { city: "Lagos" },
            location: { latitude: 6.6, longitude: 3.9 }, // well over 0.15km away
        });
        RoomProperty.find.mockReturnValue({ populate: jest.fn().mockResolvedValue([near, far]) });

        const req = { user: HOST_USER, query: { latitude: "6.4433", longitude: "3.4727", city: "Lagos" } };
        const res = mockRes();
        await roomPropertiesController.suggest(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const payload = res.json.mock.calls[0][0];
        expect(payload.property.id).toBe("propNear");
        expect(payload.property.roomCount).toBe(3);
        expect(payload.property.categoryId).toBe("cat1");
        expect(payload.distanceKm).toBeLessThan(0.15);
    });

    test("host user: no property within range returns null, not an error", async () => {
        const far = fakePropertyDoc({
            _id: "propFar",
            hostId: "host1",
            address: { city: "Lagos" },
            location: { latitude: 9.0, longitude: 7.4 },
        });
        RoomProperty.find.mockReturnValue({ populate: jest.fn().mockResolvedValue([far]) });

        const req = { user: HOST_USER, query: { latitude: "6.4433", longitude: "3.4727", city: "Lagos" } };
        const res = mockRes();
        await roomPropertiesController.suggest(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0]).toEqual({ property: null, distanceKm: null });
    });

    test("a property in a different city is never suggested, even if geographically close", async () => {
        const wrongCity = fakePropertyDoc({
            _id: "propWrongCity",
            hostId: "host1",
            address: { city: "Abuja" },
            location: { latitude: 6.4432, longitude: 3.4726 },
        });
        RoomProperty.find.mockReturnValue({ populate: jest.fn().mockResolvedValue([wrongCity]) });

        const req = { user: HOST_USER, query: { latitude: "6.4433", longitude: "3.4727", city: "Lagos" } };
        const res = mockRes();
        await roomPropertiesController.suggest(req, res);

        expect(res.json.mock.calls[0][0]).toEqual({ property: null, distanceKm: null });
    });

    test("missing latitude/longitude/city short-circuits to null without querying", async () => {
        const req = { user: HOST_USER, query: {} };
        const res = mockRes();
        await roomPropertiesController.suggest(req, res);

        expect(RoomProperty.find).not.toHaveBeenCalled();
        expect(res.json.mock.calls[0][0]).toEqual({ property: null, distanceKm: null });
    });

    test("admin user must supply hostId explicitly, or is denied", async () => {
        const req = { user: ADMIN_USER, query: { latitude: "1", longitude: "1", city: "Lagos" } };
        const res = mockRes();
        await roomPropertiesController.suggest(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    test("admin user supplying hostId is allowed", async () => {
        RoomProperty.find.mockReturnValue({ populate: jest.fn().mockResolvedValue([]) });
        const req = { user: ADMIN_USER, query: { hostId: "host1", latitude: "1", longitude: "1", city: "Lagos" } };
        const res = mockRes();
        await roomPropertiesController.suggest(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(RoomProperty.find).toHaveBeenCalledWith({ hostId: "host1" });
    });

    test("unauthenticated request is denied", async () => {
        const req = { user: undefined, query: {} };
        const res = mockRes();
        await roomPropertiesController.suggest(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    test("a host can never see suggestions scoped to a different host, even if they pass one", async () => {
        RoomProperty.find.mockReturnValue({ populate: jest.fn().mockResolvedValue([]) });
        const req = {
            user: HOST_USER,
            query: { hostId: OTHER_HOST_USER.id, latitude: "1", longitude: "1", city: "Lagos" },
        };
        const res = mockRes();
        await roomPropertiesController.suggest(req, res);

        expect(RoomProperty.find).toHaveBeenCalledWith({ hostId: HOST_USER.id });
    });
});

describe("roomProperties.getByHost", () => {
    test("host not found: 404", async () => {
        Host.findOne.mockResolvedValue(null);
        const req = { user: HOST_USER, params: { code: "HO9999" } };
        const res = mockRes();
        await roomPropertiesController.getByHost(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test("host viewing their own properties: 200 with data", async () => {
        Host.findOne.mockResolvedValue({ id: "host1", code: "HO1111" });
        const prop = fakePropertyDoc({ _id: "prop1", name: "Palm Grove Residences", categoryId: "cat1", rooms: [{}, {}] });
        RoomProperty.find.mockReturnValue({
            populate: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([prop]) }),
        });

        const req = { user: HOST_USER, params: { code: "HO1111" } };
        const res = mockRes();
        await roomPropertiesController.getByHost(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const payload = res.json.mock.calls[0][0];
        expect(payload.data).toHaveLength(1);
        expect(payload.data[0].roomCount).toBe(2);
        expect(payload.data[0].categoryId).toBe("cat1");
    });

    test("host viewing a different host's properties: 403, and the property list is never even queried", async () => {
        Host.findOne.mockResolvedValue({ id: "host2", code: "HO2222" });
        const req = { user: HOST_USER, params: { code: "HO2222" } };
        const res = mockRes();
        await roomPropertiesController.getByHost(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(RoomProperty.find).not.toHaveBeenCalled();
    });

    test("admin can view any host's properties", async () => {
        Host.findOne.mockResolvedValue({ id: "host2", code: "HO2222" });
        RoomProperty.find.mockReturnValue({
            populate: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([]) }),
        });

        const req = { user: ADMIN_USER, params: { code: "HO2222" } };
        const res = mockRes();
        await roomPropertiesController.getByHost(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });
});

describe("roomProperties.create", () => {
    test("validation error (missing name): 400", async () => {
        const req = { user: HOST_USER, body: {} };
        const res = mockRes();
        await roomPropertiesController.create(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(RoomProperty.create).not.toHaveBeenCalled();
    });

    test("missing categoryId: 400", async () => {
        const req = { user: HOST_USER, body: { name: "New Spot" } };
        const res = mockRes();
        await roomPropertiesController.create(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(RoomProperty.create).not.toHaveBeenCalled();
    });

    test("host creating a property is always scoped to their own id, regardless of what's in the body", async () => {
        Host.findById.mockResolvedValue({ id: "host1" });
        const created = fakePropertyDoc({ _id: "propNew", name: "New Spot", categoryId: "cat1" });
        RoomProperty.create.mockResolvedValue(created);

        const req = { user: HOST_USER, body: { name: "New Spot", categoryId: "cat1", hostId: OTHER_HOST_USER.id } };
        const res = mockRes();
        await roomPropertiesController.create(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(RoomProperty.create).toHaveBeenCalledWith(
            expect.objectContaining({ hostId: HOST_USER.id, categoryId: "cat1" })
        );
    });

    test("admin without an explicit hostId: 403, nothing created", async () => {
        const req = { user: ADMIN_USER, body: { name: "No host", categoryId: "cat1" } };
        const res = mockRes();
        await roomPropertiesController.create(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(RoomProperty.create).not.toHaveBeenCalled();
    });

    test("hostId that doesn't resolve to a real host: 404", async () => {
        Host.findById.mockResolvedValue(null);
        const req = { user: ADMIN_USER, body: { name: "Ghost Property", categoryId: "cat1", hostId: "missingHost" } };
        const res = mockRes();
        await roomPropertiesController.create(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(RoomProperty.create).not.toHaveBeenCalled();
    });

    test("address/location are optional — a name+category-only property is created successfully", async () => {
        Host.findById.mockResolvedValue({ id: "host1" });
        const created = fakePropertyDoc({ _id: "propNoAddress", name: "Name Only", categoryId: "cat1" });
        RoomProperty.create.mockResolvedValue(created);

        const req = { user: HOST_USER, body: { name: "Name Only", categoryId: "cat1" } };
        const res = mockRes();
        await roomPropertiesController.create(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
    });
});
