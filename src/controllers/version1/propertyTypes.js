// MODELS
const PropertyType = require("../../models/propertyTypes");
const PropertyOwner = require("../../models/propertyOwners");
// VALIDATIONS
const { propertyTypeValidation } = require("../../validations/propertyTypes");

// UTILITIES
const Response = require("../../utilities/response_utility");
const DateUtil = require("../../utilities/date_utility");

const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `PropertyType`;

module.exports = {
  create: async (req, res) => {
    try {
      const propertyTypeData = req.body;

      const { error } = propertyTypeValidation(propertyTypeData);

      if (error) {
        return Response.errorResponse(res, 400, error);
      }

      const newPropertyType = new PropertyType({
        ownerCode: propertyTypeData.actionBy,
        name: propertyTypeData.name,
        description: propertyTypeData.description,
        status: 1,
        createdOn: DateUtil.currentDate(),
      });

      const savedPropertyType = await newPropertyType.save();

      const action = `New ${moduleName}`;
      const person = propertyTypeData.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, savedPropertyType);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getPropertyTypeByOwner: async (req, res) => {
    try {
      const creator = req.params.id;

      const owner = await PropertyType.find({ ownerCode: creator });
      // console.log(owner);

      if (!owner) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      const totalPropertyType = await PropertyType.countDocuments({
        ownerCode: creator,
      });


      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalPropertyType
      );

      if (pagination.page > pagination.pages) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.OUTOF_DATA
        );
      }

      const propertyTypes = await PropertyType.find({ ownerCode: creator })
        .select("-createdOn -updatedOn")
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      pagination.data = propertyTypes.map((pagination) => {
        pagination.id = pagination._id.toHexString();
        return pagination;
      });

      pagination.rows = totalPropertyType;

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getPropertyType: async (req, res) => {
    try {
      const totalPropertyType = await PropertyType.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalPropertyType
      );

      if (pagination.page > pagination.pages) {
        return res.status(200).json({
          message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
        });
      }

      pagination.data = await PropertyType.find()
        // .populate({ path: "category", select: "name claims" })
        .select("-createdOn -updatedOn")
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

  getPropertyTypeById: async (req, res) => {
    try {
      const propertyTypeId = req.params.id;

      const propertyType = await PropertyType.findById(propertyTypeId).select(
        "-updatedOn -createdOn"
      );

      if (!propertyType) {
        return Response.errorResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      propertyType.id = propertyType._id.toHexString();

      return Response.successResponse(res, res.statusCode, propertyType);
    } catch (err) {
      return Response.errorResponse(res, 500, err.message);
    }
  },

  delete: async (req, res) => {
    try {
      const propertyType = await PropertyType.findById(req.params.id);

      if (!propertyType) {
        return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
      }

      await propertyType.deleteOne();

      const action = `Deleted ${moduleName} - ${propertyType.code}`;
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

  update: async (req, res) => {
    try {
      const propertyType = await PropertyType.findById(req.body.id);

      if (!propertyType) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      propertyType.ownerCode = req.body.actionBy || propertyType.ownerCode;
      propertyType.name = req.body.name || propertyType.name;
      propertyType.description =
        req.body.description || propertyType.description;
      propertyType.status =
        req.body.status || propertyType.status;
      propertyType.updatedOn = DateUtil.currentDate();

      const updatedPropertyType = await propertyType.save();

      const action = `Update ${moduleName}`;
      const person = req.body.actionBy;
      await createActivityLog(propertyType, action, person);

      return Response.successResponse(res, res.statusCode, updatedPropertyType);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },
};
