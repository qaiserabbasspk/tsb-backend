// MODELS
const ApplicationFee = require("../../models/applicationFee");
const Currency = require("../../models/currencies");
const ChargeType = require("../../models/chargeTypes");
const PropertyOwner = require("../../models/propertyOwners");

// VALIDATIONS
const { applicationFeeValidation } = require("../../validations/applicationFee");

// UTILITIES
const Response = require("../../utilities/response_utility");
const DateUtil = require("../../utilities/date_utility");

const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `ApplicationFee`;

module.exports = {
  create: async (req, res) => {
    try {
      const feeeData = req.body;

      const { error } = applicationFeeValidation(feeeData);
      if (error) {
        return Response.errorResponse(res, 400, error);
      }

      const currency = await Currency.findById(feeeData.currencyId);
      const chargeType = await ChargeType.findById(feeeData.chargeTypeId);
      const owner = await PropertyOwner.findOne({ code: feeeData.ownerCode });

      if (!chargeType) {
        return Response.errorResponse(res, 404, ResponseMessage.NO_CHARGETYPE_RECORD);
      }

      if (!currency) {
        return Response.customResponse(res, 404, ResponseMessage.NO_CURRENCY_RECORD);
      }

      if (!owner) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      const newFee = new ApplicationFee({
        name: feeeData.name,
        ownerCode: owner.code,
        amount: feeeData.amount,
        currency: currency.symbol,
        chargeTypeId: chargeType._id,
        description: feeeData.description,
        createdOn: DateUtil.currentDate(),
      });

      const savedApplicationFee = await newFee.save();

      const action = `New ${moduleName}`;
      const person = owner.code;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, savedApplicationFee);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getApplicationFeesByOwner: async (req, res) => {
    try {
      const creator = req.params.id;

      const owner = await PropertyOwner.findOne({ code: creator });
      // console.log(owner);

      if (!owner) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      const totalFees = await ApplicationFee.countDocuments({
        ownerCode: owner.code,
      });

      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalFees
      );

      if (pagination.page > pagination.pages) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.OUTOF_DATA
        );
      }

      const appFees = await ApplicationFee.find({ ownerCode: owner.code })
        .populate(
          [
            { path: "chargeType", select: "id name accountType description" },
          ]
        )
        .select("-createdOn -updatedOn")
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      pagination.data = appFees.map((pagination) => {
        pagination.id = pagination._id.toHexString();
        return pagination;
      });

      pagination.rows = totalFees;

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getApplicationFees: async (req, res) => {
    try {
      const totalFees = await ApplicationFee.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalFees
      );

      if (pagination.page > pagination.pages) {
        return res.status(200).json({
          message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
        });
      }

      pagination.data = await ApplicationFee.find()
        .populate(
          [
            { path: "chargeType", select: "id name accountType description" },
          ]
        )
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

  getFeeById: async (req, res) => {
    try {
      const appFee = await ApplicationFee.findById(req.params.id).populate(
        [
          { path: "chargeType", select: "id name accountType description" },
        ]
      );

      if (!appFee) {
        return Response.customResponse(res, 404, ResponseMessage.NO_APPLICATIONFEE_RECORD);
      }

      return Response.successResponse(res, res.statusCode, appFee);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  delete: async (req, res) => {
    try {
      const appFee = await ApplicationFee.findById(req.params.id);

      if (!appFee) {
        return Response.customResponse(res, 404, ResponseMessage.NO_APPLICATIONFEE_RECORD);
      }

      await appFee.deleteOne();

      const action = `Deleted ${moduleName} - ${appFee.name}`;
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
      const appFee = await ApplicationFee.findById(req.body.id);

      if (!appFee) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      const owner = await PropertyOwner.findOne({ code: req.body.ownerCode });

      appFee.name = req.body.name || appFee.name;
      appFee.amount = req.body.amount || appFee.amount;
      appFee.description = req.body.description || appFee.description;
      appFee.chargeTypeId = req.body.chargeTypeId || appFee.chargeTypeId;
      appFee.ownerCode = req.body.ownerCode == '' || req.body.ownerCode == null ? appFee.ownerCode : owner.code;
      appFee.updatedOn = DateUtil.currentDate();

      const updatedApplicationFee = await appFee.save();

      const person = req.body.ownerCode;
      const action = `Updated ${moduleName}`;
      await createActivityLog(appFee, action, person);

      return Response.successResponse(res, res.statusCode, updatedApplicationFee);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },
};
