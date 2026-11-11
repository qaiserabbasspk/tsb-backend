const Bill = require("../../models/bills");
const Owner = require("../../models/propertyOwners");
const Tenant = require("../../models/tenants");
const { billsValidation } = require("../../validations/bills");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `Bills`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;

            const { error } = billsValidation(body);

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

            const bill = Bill({
                title: body.title,
                reason: body.reason,
                remark: body.remark,
                attachments: body.attachments,
                ownerId: body.ownerId,
                tenantId: body.tenantId,
                actionBy: body.actionBy
            });

            const newBill = await bill.save();

            const action = `New ${moduleName} - ${newBill.title}`;
            const person = body.actionBy;
            await createActivityLog(moduleName, action, person);

            return Response.successResponse(res, res.statusCode, newBill);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
        try {
            const totalBills = await Bill.countDocuments();
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalBills
            );

            // if (totalBills == 0) {
            //     return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            // }

            if (totalBills === 0) {
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

            pagination.data = await Bill.find()
                .populate(
                    [{ path: "owner", select: "id code name email phone" },
                    { path: "tenant", select: "id code name email phone" },]
                )
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (totalBills === 0) {
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
            const totalBills = await Bill.countDocuments({ ownerId: owenerId });
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalBills
            );

            // if (totalBills == 0) {
            //     return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            // }

            if (totalBills === 0) {
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

            pagination.data = await Bill.find({ ownerId: owenerId })
                .populate(
                    [{ path: "owner", select: "id code name email phone" },
                    { path: "tenant", select: "id code name email phone" },]
                )
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (totalBills === 0) {
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
            const totalBills = await Bill.countDocuments({ tenantId: tenantId });
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalBills
            );

            // if (totalBills == 0) {
            //     return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            // }

            if (totalBills === 0) {
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

            pagination.data = await Bill.find({ tenantId: tenantId })
                .populate(
                    [{ path: "owner", select: "id code name email phone" },
                    { path: "tenant", select: "id code name email phone" },]
                )
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (totalBills === 0) {
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
            const bill = await Bill.findById(body.id);

            if (!bill) {
                return Response.customResponse(res, 404, MessageUtility.NO_RECORD);
            }

            bill.title = body.title || bill.title;
            bill.reason = body.reason || bill.reason;
            bill.remark = body.remark || bill.remark;

            const updatedBill = await bill.save();

            const action = `${moduleName} Updated`;
            const person = body.actionBy;
            await createActivityLog(moduleName, action, person);
            return res.status(res.statusCode).json(updatedBill);
        } catch (error) {
            return Response.errorResponse(res, 500, error);
        }
    },

    delete: async (req, res) => {
        try {
            const bill = await Bill.findById(req.params.id);

            if (!bill) {
                return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
            }

            await bill.deleteOne();

            const action = `Deleted ${moduleName} - ${bill.title}`;
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