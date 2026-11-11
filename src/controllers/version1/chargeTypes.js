// MODELS
const ChargeType = require("../../models/chargeTypes");
const AccountType = require("../../models/accountTypes");

// VALIDATIONS
const { chargeTypeValidation } = require("../../validations/chargeTypes");

// UTILITIES
const Response = require("../../utilities/response_utility");
const DateUtil = require("../../utilities/date_utility");

const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `ChargeType`;

module.exports = {
  create: async (req, res) => {
    try {
      const propertyTypeData = req.body;

      const { error } = chargeTypeValidation(propertyTypeData);

      if (error) {
        return Response.errorResponse(res, 400, error);
      }

      const accType = await AccountType.findById(propertyTypeData.accountTypeId);
      if (!accType)
        return Response.customResponse(res, 404, ResponseMessage.NO_ACCOUNT_RECORD);

      const newChargeType = new ChargeType({
        status: 1,
        accountType: accType.name,
        name: propertyTypeData.name,
        description: propertyTypeData.description,
        createdOn: DateUtil.currentDate(),
        ownerCode: propertyTypeData.actionBy,
      });

      const savedChargeType = await newChargeType.save();

      const action = `New ${moduleName}`;
      const person = propertyTypeData.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, savedChargeType);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getChargeTypesByOwner: async (req, res) => {
    try {
      const creator = req.params.id;

      const owner = await ChargeType.find({ ownerCode: creator });
      // console.log(owner);

      if (!owner) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      const totalPropertyStatus = await ChargeType.countDocuments({
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

      const propertyStatus = await ChargeType.find({ ownerCode: creator })
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

  getChargeType: async (req, res) => {
    try {
      const totalChargeType = await ChargeType.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalChargeType
      );

      if (pagination.page > pagination.pages) {
        return res.status(200).json({
          message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
        });
      }

      pagination.data = await ChargeType.find()
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

  getChargeTypeById: async (req, res) => {
    try {
      const propertyTypeId = req.params.id;

      const chargeType = await ChargeType.findById(propertyTypeId).select(
        "-updatedOn -createdOn"
      );

      if (!chargeType) {
        return Response.errorResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      chargeType.id = chargeType._id.toHexString();

      return Response.successResponse(res, res.statusCode, chargeType);
    } catch (err) {
      return Response.errorResponse(res, 500, err.message);
    }
  },

  delete: async (req, res) => {
    try {
      const chargeType = await ChargeType.findById(req.params.id);

      if (!chargeType) {
        return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
      }

      await chargeType.deleteOne();

      const action = `Deleted ${moduleName} - ${chargeType.code}`;
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
      const chargeType = await ChargeType.findById(req.body.id);

      if (!chargeType) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      chargeType.ownerCode = req.body.actionBy || chargeType.ownerCode;
      chargeType.name = req.body.name || chargeType.name;
      chargeType.description =
        req.body.description || chargeType.description;
      chargeType.status =
        req.body.status;
      chargeType.updatedOn = DateUtil.currentDate();

      const updatedChargeType = await chargeType.save();

      const action = `Update ${moduleName}`;
      const person = req.body.actionBy;
      await createActivityLog(chargeType, action, person);

      return Response.successResponse(res, res.statusCode, updatedChargeType);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },
};
