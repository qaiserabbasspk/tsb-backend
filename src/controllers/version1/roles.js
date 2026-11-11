// MODELS
const Role = require("../../models/roles");

// VALIDATIONS
const { roleValidation } = require("../../validations/roles");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `Role`;

module.exports = {
  create: async (req, res) => {
    try {
      const body = req.body;

      const { error } = roleValidation(body);

      if (error) {
        return Response.sendValidationErrorMessage(res, 400, error);
      }

      const existingAccountType = await Role.findOne({
        name: body.name,
        symbol: body.symbol,
      });

      if (existingAccountType) {
        return Response.customResponse(res, 409, ResponseMessage.DATA_EXISTS);
      }

      const roles = new Role({
        ownerCode: body.actionBy,
        name: body.name,
        description: body.description,
        claims: body.claims,
        status: body.status || 1,
        createdOn: DateUtil.currentDate(),
      });

      const newAccountType = await roles.save();

      const action = `New ${moduleName} - ${body.name}`;
      const person = body.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, newAccountType);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getRoles: async (req, res) => {
    try {
      const totalRoles = await Role.countDocuments();

      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalRoles
      );

      if (pagination.page > pagination.pages) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.OUTOF_DATA
        );
      }

      pagination.data = await Role.find()
        .select("-actionBy")
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize)
        .lean();

      pagination.data = pagination.data.map((account) => {
        account.id = account._id.toHexString();

        return account;
      });

      if (totalRoles === 0) {
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

  getRoleById: async (req, res) => {
    try {
      const accountTypeId = req.params.id;
      const roles = await Role.findById(accountTypeId).select("-actionBy").lean();

      if (!roles) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      roles.id = roles._id.toHexString();

      return Response.successResponse(res, res.statusCode, roles);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  update: async (req, res) => {
    try {
      const body = req.body;
      const roles = await Role.findById(body.id);

      if (!roles) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      roles.ownerCode = body.actionBy || roles.ownerCode;
      roles.name = roles.name;
      // roles.name = body.name || roles.name;
      roles.description = body.description || roles.description;
      roles.claims = body.claims || roles.claims;
      roles.status = body.status;
      roles.updatedOn = DateUtil.currentDate();

      const updatedAccountType = await roles.save();

      // const actionNames = priviledge.claims
      //   .map((claim) => claim.name)
      //   .join(", ");

      const action = `Updated ${moduleName} - ${body.name}`;
      const person = body.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, updatedAccountType);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  delete: async (req, res) => {
    try {
      const param = req.params;
      const roles = await Role.findById(param.id);

      if (!roles) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      await roles.deleteOne();

      const action = `Deleted ${moduleName} - ${roles.name}`;
      const person = param.actionBy;
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
};
