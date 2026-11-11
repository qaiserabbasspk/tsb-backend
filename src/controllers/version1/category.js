const Category = require("../../models/category");
const { categoryValidation } = require("../../validations/category");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/qbActivityLog_utility");

const moduleName = `Category`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;

            const { error } = categoryValidation(body);

            if (error) {
                return Response.errorResponse(res, 400, error);
            }

            const existingCategory = await Category.findOne({
                name: body.name,
            });

            if (existingCategory) {
                return Response.customResponse(res, 409, ResponseMessage.DATA_EXISTS);
            }

            const category = Category({
                name: body.name,
                icon: body.icon,
                iconCodePoint: body.iconCodePoint,
                image: body.image
            });

            const newCategory = await category.save();

            const action = `New ${moduleName} - ${newCategory.name}`;
            const person = body.actionBy;
            await createActivityLog(moduleName, action, person);

            return Response.successResponse(res, res.statusCode, newCategory);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
        try {
            const totalCategories = await Category.countDocuments();
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalCategories
            );

            if (pagination.page > pagination.pages) {
                return res.status(200).json({
                    message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
                });
            }

            pagination.data = await Category.find()
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
            const categoryId = req.params.id;

            const category = await Category.findById(categoryId).select();

            if (!category) {
                return Response.errorResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            return Response.successResponse(res, res.statusCode, category);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message);
        }
    },

    update: async (req, res) => {
        try {
            const category = await Category.findById(req.body.id);

            if (!category) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            category.name = req.body.name || category.name;
            category.icon = req.body.icon || category.icon;
            category.image = req.body.image || category.image;
            category.iconCodePoint = req.body.iconCodePoint || category.iconCodePoint;

            const updatedCategory = await category.save();

            const action = `Update ${moduleName}`;
            const person = req.body.actionBy;
            await createActivityLog(category, action, person);

            return Response.successResponse(res, res.statusCode, updatedCategory);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    delete: async (req, res) => {
        try {
            const category = await Category.findById(req.params.id);

            if (!category) {
                return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
            }

            await category.deleteOne();

            const action = `Deleted ${moduleName} - ${category.name}`;
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