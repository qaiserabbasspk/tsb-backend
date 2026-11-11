// MODELS
const ApplicationStatus = require("../../models/applicationStatuses");

// VALIDATIONS
const { applicationStatusValidation } = require("../../validations/applicationStatuses");

// UTILITIES
const Response = require("../../utilities/response_utility");
const DateUtil = require("../../utilities/date_utility");

const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `ApplicationStatus`;

module.exports = {
  create: async (req, res) => {
    try {
      const applicationStatusData = req.body;

      const { error } = applicationStatusValidation(applicationStatusData);

      if (error) {
        return Response.errorResponse(res, 400, error);
      }

      const newApplicationStatus = new ApplicationStatus({
        ownerCode: applicationStatusData.actionBy,
        name: applicationStatusData.name,
        description: applicationStatusData.description,
        status: 1,
        createdOn: DateUtil.currentDate(),
      });

      const savedApplicationStatus = await newApplicationStatus.save();

      const action = `New ${moduleName}`;
      const person = applicationStatusData.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, savedApplicationStatus);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getAppStatusByOwner: async (req, res) => {
    try {
      const creator = req.params.id;

      const owner = await ApplicationStatus.find({ ownerCode: creator });
      // console.log(owner);

      if (!owner) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      const totalPropertyStatus = await ApplicationStatus.countDocuments({
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

      const propertyStatus = await ApplicationStatus.find({ ownerCode: creator })
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

  getApplicationStatus: async (req, res) => {
    try {
      const totalApplicationStatus = await ApplicationStatus.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalApplicationStatus
      );

      if (pagination.page > pagination.pages) {
        return res.status(200).json({
          message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
        });
      }

      pagination.data = await ApplicationStatus.find()
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

  getApplicationStatusById: async (req, res) => {
    try {
      const applicationStatusId = req.params.id;

      const applicationStatus = await ApplicationStatus.findById(applicationStatusId).select(
        "-updatedOn -createdOn"
      );

      if (!applicationStatus) {
        return Response.errorResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      applicationStatus.id = applicationStatus._id.toHexString();

      return Response.successResponse(res, res.statusCode, applicationStatus);
    } catch (err) {
      return Response.errorResponse(res, 500, err.message);
    }
  },

  delete: async (req, res) => {
    try {
      const applicationStatus = await ApplicationStatus.findById(req.params.id);

      if (!applicationStatus) {
        return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
      }

      await applicationStatus.deleteOne();

      const action = `Deleted ${moduleName} - ${applicationStatus.code}`;
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
      const applicationStatus = await ApplicationStatus.findById(req.body.id);

      if (!applicationStatus) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      applicationStatus.ownerCode = req.body.actionBy || applicationStatus.ownerCode;
      applicationStatus.name = req.body.name || applicationStatus.name;
      applicationStatus.description =
        req.body.description || applicationStatus.description;
      applicationStatus.status =
        req.body.status || applicationStatus.propertyCategoryId;
      applicationStatus.updatedOn = DateUtil.currentDate();

      const updatedApplicationStatus = await applicationStatus.save();

      const action = `Update ${moduleName}`;
      const person = req.body.actionBy;
      await createActivityLog(applicationStatus, action, person);

      return Response.successResponse(res, res.statusCode, updatedApplicationStatus);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },
};
