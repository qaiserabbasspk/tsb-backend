const Bank = require("../../models/bank");
const { bankValidation } = require("../../validations/bank");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/qbActivityLog_utility");

const moduleName = `Bank`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;

            const { error } = bankValidation(body);

            if (error) {
                return Response.errorResponse(res, 400, error);
            }

            const existingBank = await Bank.findOne({
                name: body.name,
            });

            if (existingBank) {
                return Response.customResponse(res, 409, ResponseMessage.DATA_EXISTS);
            }

            const bank = Bank({
                name: body.name
            });

            const newBank = await bank.save();

            const action = `New ${moduleName} - ${newBank.name}`;
            const person = body.actionBy;
            await createActivityLog(moduleName, action, person);

            return Response.successResponse(res, res.statusCode, newBank);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
        try {
            const totalBanks = await Bank.countDocuments();
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalBanks
            );

            if (pagination.page > pagination.pages) {
                return res.status(200).json({
                    message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
                });
            }

            pagination.data = await Bank.find()
                .select()
                //.sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            pagination.data = pagination.data.map((pagination) => {
                pagination.id = pagination._id.toHexString();
                return pagination;
            });

            if (pagination.length === 0) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.NO_DATA
                );
            }

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getById: async (req, res) => {
        try {
            const bankId = req.params.id;

            const bank = await Bank.findById(bankId).select();

            if (!bank) {
                return Response.errorResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            return Response.successResponse(res, res.statusCode, bank);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message);
        }
    },

    update: async (req, res) => {
        try {
            const bank = await Bank.findById(req.body.id);

            if (!bank) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            bank.name = req.body.name || bank.name;

            const updatedBank = await bank.save();

            const action = `Update ${moduleName}`;
            const person = req.body.actionBy;
            await createActivityLog(bank, action, person);

            return Response.successResponse(res, res.statusCode, updatedBank);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    delete: async (req, res) => {
        try {
            const bank = await Bank.findById(req.params.id);

            if (!bank) {
                return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
            }

            await bank.deleteOne();

            const action = `Deleted ${moduleName} - ${bank.name}`;
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