const Amenity = require("../../models/amenity");
const { amenityValidation } = require("../../validations/amenity");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/qbActivityLog_utility");

const moduleName = `Amenity`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;

            const { error } = amenityValidation(body);

            if (error) {
                return Response.errorResponse(res, 400, error);
            }

            const existingAmenity = await Amenity.findOne({
                name: body.name,
            });

            if (existingAmenity) {
                return Response.customResponse(res, 409, ResponseMessage.DATA_EXISTS);
            }

            const amenity = Amenity({
                name: body.name,
                icon: body.icon,
                iconCodePoint: body.iconCodePoint
            });

            const newAmenity = await amenity.save();

            const action = `New ${moduleName} - ${newAmenity.name}`;
            const person = body.actionBy;
            await createActivityLog(moduleName, action, person);

            return Response.successResponse(res, res.statusCode, newAmenity);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
        try {
            const totalAmenities = await Amenity.countDocuments();
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalAmenities
            );

            if (pagination.page > pagination.pages) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.OUTOF_DATA
                );
            }

            pagination.data = await Amenity.find()
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
            const amenityId = req.params.id;

            const amenity = await Amenity.findById(amenityId).select();

            if (!amenity) {
                return Response.errorResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            //applicationStatus.id = applicationStatus._id.toHexString();

            return Response.successResponse(res, res.statusCode, amenity);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message);
        }
    },

    update: async (req, res) => {
        try {
            const amenity = await Amenity.findById(req.body.id);

            if (!amenity) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            amenity.name = req.body.name || amenity.name;
            amenity.icon = req.body.icon || amenity.icon;
            amenity.iconCodePoint = req.body.iconCodePoint || amenity.iconCodePoint;

            const updatedAmenity = await amenity.save();

            const action = `Update ${moduleName}`;
            const person = req.body.actionBy;
            await createActivityLog(amenity, action, person);

            return Response.successResponse(res, res.statusCode, updatedAmenity);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    delete: async (req, res) => {
        try {
            const amenity = await Amenity.findById(req.params.id);

            if (!amenity) {
                return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
            }

            await amenity.deleteOne();

            const action = `Deleted ${moduleName} - ${amenity.name}`;
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