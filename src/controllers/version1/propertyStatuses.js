// MODELS
const PropertyStatus = require("../../models/propertyStatuses");

// VALIDATIONS
const { propertyStatusValidation } = require("../../validations/propertyStatuses");

// UTILITIES
const Response = require("../../utilities/response_utility");
const DateUtil = require("../../utilities/date_utility");

const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `PropertyStatus`;

module.exports = {
  create: async (req, res) => {
    try {
      const propertyStatusData = req.body;

      const { error } = propertyStatusValidation(propertyStatusData);

      if (error) {
        return Response.errorResponse(res, 400, error);
      }

      const newPropertyStatus = new PropertyStatus({
        ownerCode: propertyStatusData.actionBy,
        name: propertyStatusData.name,
        description: propertyStatusData.description,
        status: 1,
        createdOn: DateUtil.currentDate(),
      });

      const savedPropertyStatus = await newPropertyStatus.save();

      const action = `New ${moduleName}`;
      const person = propertyStatusData.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, savedPropertyStatus);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getPropertyStatusByOwner: async (req, res) => {
    try {
      const creator = req.params.id;

      const owner = await PropertyStatus.find({ ownerCode: creator });
      // console.log(owner);

      if (!owner) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      const totalPropertyStatus = await PropertyStatus.countDocuments({
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

      const propertyStatus = await PropertyStatus.find({ ownerCode: creator })
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

  getPropertyStatus: async (req, res) => {
    try {
      const totalPropertyStatus = await PropertyStatus.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalPropertyStatus
      );

      if (pagination.page > pagination.pages) {
        return res.status(200).json({
          message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
        });
      }

      pagination.data = await PropertyStatus.find()
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

  getPropertyStatusById: async (req, res) => {
    try {
      const propertyTypeId = req.params.id;

      const propertyStatus = await PropertyStatus.findById(propertyTypeId).select(
        "-updatedOn -createdOn"
      );

      if (!propertyStatus) {
        return Response.errorResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      propertyStatus.id = propertyStatus._id.toHexString();

      return Response.successResponse(res, res.statusCode, propertyStatus);
    } catch (err) {
      return Response.errorResponse(res, 500, err.message);
    }
  },

  delete: async (req, res) => {
    try {
      const propertyStatus = await PropertyStatus.findById(req.params.id);

      if (!propertyStatus) {
        return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
      }

      await propertyStatus.deleteOne();

      const action = `Deleted ${moduleName} - ${propertyStatus.code}`;
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
      const propertyStatus = await PropertyStatus.findById(req.body.id);

      if (!propertyStatus) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      propertyStatus.ownerCode = req.body.actionBy || propertyStatus.ownerCode;
      propertyStatus.name = req.body.name || propertyStatus.name;
      propertyStatus.description =
        req.body.description || propertyStatus.description;
      propertyStatus.status =
        req.body.status || propertyStatus.propertyCategoryId;
      propertyStatus.updatedOn = DateUtil.currentDate();

      const updatedPropertyStatus = await propertyStatus.save();

      const action = `Update ${moduleName}`;
      const person = req.body.actionBy;
      await createActivityLog(propertyStatus, action, person);

      return Response.successResponse(res, res.statusCode, updatedPropertyStatus);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },
};
