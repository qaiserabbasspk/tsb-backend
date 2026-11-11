const Lease = require("../../models/lease");
const Owner = require("../../models/propertyOwners");
const Tenant = require("../../models/tenants");
const Property = require("../../models/properties");
const PropertyUnit = require("../../models/propertyUnits");
const { leaseValidation } = require("../../validations/lease");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `Lease`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;

            const { error } = leaseValidation(body);

            if (error) {
                return Response.errorResponse(res, 400, error);
            }

            const owner = await Owner.findById(body.ownerId);

            if (!owner) {
                return Response.customResponse(res, 400, ResponseMessage.NO_OWNER_RECORD);
            }

            const tenant = await Tenant.findById(body.tenantId);

            if (!tenant) {
                return Response.customResponse(res, 400, ResponseMessage.NO_TENANT_RECORD);
            }

            const property = await Property.findById(body.propertyId);

            if (!property) {
                return Response.customResponse(res, 400, ResponseMessage.NO_PROPERTY_RECORD);
            }

            const propertyUnit = await PropertyUnit.findById(body.propertyUnitId);

            if (!propertyUnit) {
                return Response.customResponse(res, 400, ResponseMessage.NO_PROPERTY_UNIT);
            }

            const lease = Lease({
                title: body.title,
                remark: body.remark,
                fromDate: body.fromDate,
                toDate: body.toDate,
                attachments: body.attachments,
                ownerId: body.ownerId,
                tenantId: body.tenantId,
                propertyId: body.propertyId,
                propertyUnitId: body.propertyUnitId,
                actionBy: body.actionBy
            });

            const newLease = await lease.save();

            const action = `New ${moduleName} - ${newLease.title}`;
            const person = body.actionBy;
            await createActivityLog(moduleName, action, person);

            return Response.successResponse(res, res.statusCode, newLease);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
        try {
            const totalLeases = await Lease.countDocuments();
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalLeases
            );

            // if (totalLeases == 0) {
            //     return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            // }

            if (totalLeases === 0) {
                return res.status(200).json({
                    page: 1,
                    pages: 0,
                    pageSize: 10,
                    rows: 0,
                    data: []
                });
            }

            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
            }

            pagination.data = await Lease.find()
                .populate(
                    [
                        { path: "owner", select: "id code name email phone" },
                        { path: "tenant", select: "id code name email phone" },
                        { path: "property", select: "id code description address" },
                        { path: "propertyUnit", select: "id code name price currency" },
                    ]
                )
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (totalLeases === 0) {
                return Response.customResponse(
                    res,
                    404,
                    ResponseMessage.NO_DATA
                );
            }

            pagination.data = pagination.data.map((item) => ({
                ...item.toJSON(),
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (error) {
            return Response.errorResponse(res, 500, error);
        }
    },

    getByOwner: async (req, res) => {
        try {
            const owenerId = req.params.id;
            const totalLeases = await Lease.countDocuments({ ownerId: owenerId });
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalLeases
            );

            // if (totalLeases == 0) {
            //     return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            // }

            if (totalLeases === 0) {
                return res.status(200).json({
                    page: 1,
                    pages: 0,
                    pageSize: 10,
                    rows: 0,
                    data: []
                });
            }

            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
            }

            pagination.data = await Lease.find({ ownerId: owenerId })
                .populate(
                    [
                        { path: "owner", select: "id code name email phone" },
                        { path: "tenant", select: "id code name email phone" },
                        { path: "property", select: "id code description address" },
                        { path: "propertyUnit", select: "id code name price currency" },
                    ]
                )
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (totalLeases === 0) {
                return Response.customResponse(
                    res,
                    404,
                    ResponseMessage.NO_DATA
                );
            }

            pagination.data = pagination.data.map((item) => ({
                ...item.toJSON(),
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (error) {
            return Response.errorResponse(res, 500, error);
        }
    },

    getByTenant: async (req, res) => {
        try {
            const tenantId = req.params.id;
            const totalLeases = await Lease.countDocuments({ tenantId: tenantId });
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalLeases
            );

            // if (totalLeases == 0) {
            //     return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            // }

            if (totalLeases === 0) {
                return res.status(200).json({
                    page: 1,
                    pages: 0,
                    pageSize: 10,
                    rows: 0,
                    data: []
                });
            }

            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
            }

            pagination.data = await Lease.find({ tenantId: tenantId })
                .populate(
                    [
                        { path: "owner", select: "id code name email phone" },
                        { path: "tenant", select: "id code name email phone" },
                        { path: "property", select: "id code description address" },
                        { path: "propertyUnit", select: "id code name price currency" },
                    ]
                )
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (totalLeases === 0) {
                return Response.customResponse(
                    res,
                    404,
                    ResponseMessage.NO_DATA
                );
            }

            pagination.data = pagination.data.map((item) => ({
                ...item.toJSON(),
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (error) {
            return Response.errorResponse(res, 500, error);
        }
    },

    update: async (req, res) => {
        try {
            const body = req.body;
            const lease = await Lease.findById(body.id);

            if (!lease) {
                return Response.customResponse(res, 404, MessageUtility.NO_RECORD);
            }

            lease.title = body.title || lease.title;
            lease.remark = body.remark || lease.remark;
            lease.fromDate = body.fromDate || lease.fromDate;
            lease.toDate = body.toDate || lease.toDate;

            const updatedLease = await lease.save();

            const action = `${moduleName} Updated`;
            const person = body.actionBy;
            await createActivityLog(moduleName, action, person);
            return res.status(res.statusCode).json(updatedLease);
        } catch (error) {
            return Response.errorResponse(res, 500, error);
        }
    },

    delete: async (req, res) => {
        try {
            const lease = await Lease.findById(req.params.id);

            if (!lease) {
                return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
            }

            await lease.deleteOne();

            const action = `Deleted ${moduleName} - ${lease.title}`;
            const person = req.param.actionBy;
            await createActivityLog(moduleName, action, person);

            return Response.customResponse(
                res,
                res.statusCode,
                ResponseMessage.SUCCESS_MESSAGE
            );
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },
}