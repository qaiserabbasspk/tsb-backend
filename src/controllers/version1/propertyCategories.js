// MODELS
const PropertyCategory = require("../../models/propertyCategories");

// VALIDATIONS
const { propertyCategoryValidation } = require("../../validations/propertyCategories");

// UTILITIES
const Response = require("../../utilities/response_utility");
const DateUtil = require("../../utilities/date_utility");

const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `PropertyCategory`;

module.exports = {
  create: async (req, res) => {
    try {
      const propertyCategoryData = req.body;

      const { error } = propertyCategoryValidation(propertyCategoryData);

      if (error) {
        return Response.errorResponse(res, 400, error);
      }

      const newPropertyCategory = new PropertyCategory({
        ownerCode: propertyCategoryData.actionBy,
        name: propertyCategoryData.name,
        description: propertyCategoryData.description,
        status: 1,
        createdOn: DateUtil.currentDate(),
      });

      const savedPropertyCategory = await newPropertyCategory.save();

      const action = `New ${moduleName}`;
      const person = propertyCategoryData.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, savedPropertyCategory);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getPropertyCategoryByOwner: async (req, res) => {
    try {
      const creator = req.params.id;

      const owner = await PropertyCategory.find({ ownerCode: creator });
      // console.log(owner);

      if (!owner) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      const totalPropertyStatus = await PropertyCategory.countDocuments({
        ownerCode: creator,
      });


      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalPropertyStatus
      );

      if (pagination.page > pagination.pages) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.OUTOF_DATA
        );
      }

      const propertyStatus = await PropertyCategory.find({ ownerCode: creator })
        .select("-createdOn -updatedOn")
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      pagination.data = propertyStatus.map((pagination) => {
        pagination.id = pagination._id.toHexString();
        return pagination;
      });

      pagination.rows = totalPropertyStatus;

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getPropertyCategory: async (req, res) => {
    try {
      const totalPropertyCategory = await PropertyCategory.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalPropertyCategory
      );

      if (pagination.page > pagination.pages) {
        return res.status(200).json({
          message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
        });
      }

      pagination.data = await PropertyCategory.find()
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

  getPropertyCategoryById: async (req, res) => {
    try {
      const propertyTypeId = req.params.id;

      const propertyCategory = await PropertyCategory.findById(propertyTypeId).select(
        "-updatedOn -createdOn"
      );

      if (!propertyCategory) {
        return Response.errorResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      propertyCategory.id = propertyCategory._id.toHexString();

      return Response.successResponse(res, res.statusCode, propertyCategory);
    } catch (err) {
      return Response.errorResponse(res, 500, err.message);
    }
  },

  delete: async (req, res) => {
    try {
      const propertyCategory = await PropertyCategory.findById(req.params.id);

      if (!propertyCategory) {
        return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
      }

      await propertyCategory.deleteOne();

      const action = `Deleted ${moduleName} - ${propertyCategory.code}`;
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
      const propertyCategory = await PropertyCategory.findById(req.body.id);

      if (!propertyCategory) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      propertyCategory.ownerCode = req.body.actionBy || propertyCategory.ownerCode;
      propertyCategory.name = req.body.name || propertyCategory.name;
      propertyCategory.description =
        req.body.description || propertyCategory.description;
      propertyCategory.status =
        req.body.status || propertyCategory.status;
      propertyCategory.updatedOn = DateUtil.currentDate();

      const updatedPropertyCategory = await propertyCategory.save();

      const action = `Update ${moduleName}`;
      const person = req.body.actionBy;
      await createActivityLog(propertyCategory, action, person);

      return Response.successResponse(res, res.statusCode, updatedPropertyCategory);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },
};
