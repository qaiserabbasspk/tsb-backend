// MODELS
const AccountType = require("../../models/accountTypes");

// VALIDATIONS
const { accountTypeValidation } = require("../../validations/accountTypes");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `AccountType`;

module.exports = {
  create: async (req, res) => {
    try {
      const accountTypeData = req.body;

      const { error } = accountTypeValidation(accountTypeData);

      if (error) {
        return Response.errorResponse(res, 400, error);
      }

      const existingAccountType = await AccountType.findOne({
        name: accountTypeData.name,
      });

      if (existingAccountType) {
        return Response.customResponse(res, 409, ResponseMessage.DATA_EXISTS);
      }

      const accountTypes = AccountType({
        ownerCode: accountTypeData.actionBy,
        name: accountTypeData.name,
        status: accountTypeData.status,
        createdOn: DateUtil.currentDate(),
      });

      const newAccountType = await accountTypes.save();

      const action = `New ${moduleName} - ${newAccountType.name}`;
      const person = accountTypeData.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, newAccountType);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getAllAccountTypes: async (req, res) => {
    try {
      const totalAccountTypes = await AccountType.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalAccountTypes
      );

      if (totalAccountTypes == 0) {
        return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
      }

      if (pagination.page > pagination.pages) {
        return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
      }

      pagination.data = await AccountType.find()
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      if (pagination.data.length === 0) {
        return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
      }

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getAccountType: async (req, res) => {
    try {
      const id = req.params.id;

      const foundAccountType = await AccountType.findById(id);

      if (!foundAccountType) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      return Response.successResponse(res, res.statusCode, foundAccountType);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getActiveAccountType: async (req, res) => {
    try {
      const status = req.params.status;
      const totalAccountTypes = await AccountType.countDocuments({
        status: status,
      });
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalAccountTypes
      );

      if (totalAccountTypes == 0) {
        return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
      }

      if (pagination.page > pagination.pages) {
        return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
      }

      pagination.data = await AccountType.find({ status: status })
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      if (pagination.data.length === 0) {
        return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
      }

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  update: async (req, res) => {
    try {
      const body = req.body;
      if (!body.actionBy) {
        return Response.customResponse(
          res,
          400,
          ResponseMessage.ACTIONBY_REQUIRED
        );
      }

      const foundAccountType = await AccountType.findById(body.id);

      if (!foundAccountType) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      foundAccountType.ownerCode = body.actionBy || foundAccountType.ownerCode;
      foundAccountType.name = body.name || foundAccountType.name;
      foundAccountType.updatedOn = DateUtil.currentDate();

      const update = await foundAccountType.save();
      const action = `Updated ${moduleName} - ${foundAccountType._id}`;
      const person = body.actionBy;

      await createActivityLog(moduleName, action, person);
      return Response.successResponse(res, res.statusCode, update);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  deActivateAndActivate: async (req, res) => {
    await status(req, res, AccountType, moduleName);
  },
};
