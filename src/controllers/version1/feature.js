const Feature = require("../../models/features");
const { featureValidation } = require("../../validations/features");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `Feature`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;

            const { error } = featureValidation(body);

            if (error) {
                return Response.errorResponse(res, 400, error);
            }

            const existingFeature = await Feature.findOne({
                title: body.title,
            });

            if (existingFeature) {
                return Response.customResponse(res, 409, ResponseMessage.DATA_EXISTS);
            }

            const feature = Feature({
                title: body.title,
                subtitle: body.subtitle,
                icon: body.icon,
                iconCodePoint: body.iconCodePoint
            });

            const newFeature = await feature.save();

            const action = `New ${moduleName} - ${newFeature.title}`;
            const person = body.actionBy;
            await createActivityLog(moduleName, action, person);

            return Response.successResponse(res, res.statusCode, newFeature);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
        try {
            const totalFeatures = await Feature.countDocuments();
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalFeatures
            );

            if (pagination.page > pagination.pages) {
                return res.status(200).json({
                    message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
                });
            }

            pagination.data = await Feature.find()
                .select()
                .sort({ _id: -1 })
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
            const featureId = req.params.id;

            const feature = await Feature.findById(featureId).select();

            if (!feature) {
                return Response.errorResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            return Response.successResponse(res, res.statusCode, feature);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message);
        }
    },

    update: async (req, res) => {
        try {
            const feature = await Feature.findById(req.body.id);

            if (!feature) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            feature.title = req.body.title || feature.title;
            feature.subtitle = req.body.subtitle || feature.subtitle;
            feature.icon = req.body.icon || feature.icon;
            feature.iconCodePoint = req.body.iconCodePoint || feature.iconCodePoint;

            const updatedFeature = await feature.save();

            const action = `Update ${moduleName}`;
            const person = req.body.actionBy;
            await createActivityLog(feature, action, person);

            return Response.successResponse(res, res.statusCode, updatedFeature);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    delete: async (req, res) => {
        try {
            const feature = await Feature.findById(req.params.id);

            if (!feature) {
                return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
            }

            await feature.deleteOne();

            const action = `Deleted ${moduleName} - ${feature.title}`;
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