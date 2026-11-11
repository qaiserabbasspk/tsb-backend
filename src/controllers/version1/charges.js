// MODELS
const Charge = require("../../models/charges");
const Property = require("../../models/properties");
const Currency = require("../../models/currencies");
const ChargeType = require("../../models/chargeTypes");
const PropertyUnit = require("../../models/propertyUnits");
const PropertyOwner = require("../../models/propertyOwners");

// VALIDATIONS
const { chargeValidation } = require("../../validations/charges");

// UTILITIES
const Response = require("../../utilities/response_utility");
const DateUtil = require("../../utilities/date_utility");

const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `Charge`;

module.exports = {
  create: async (req, res) => {
    try {
      const chargeData = req.body;

      const { error } = chargeValidation(chargeData);

      if (error) {
        return Response.errorResponse(res, 400, error);
      }

      const chargeType = await ChargeType.findById(chargeData.chargeTypeId);

      if (!chargeType) {
        return Response.errorResponse(res, 404, ResponseMessage.NO_CHARGETYPE_RECORD);
      }

      const property = await Property.findById(chargeData.propertyId);

      if (!property) {
        return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTY_RECORD);
      }

      const propertyUnit = await PropertyUnit.findById(chargeData.propertyUnitId);

      if (!propertyUnit) {
        return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTYUNIT_RECORD);
      }

      const currency = await Currency.findById(chargeData.currencyId);
      // console.log("test: " + currency);

      if (!currency) {
        return Response.customResponse(res, 404, ResponseMessage.NO_CURRENCY_RECORD);
      }

      const owner = await PropertyOwner.findById(property.propertyOwnerId);

      const newCharge = new Charge({
        ownerCode: chargeData.actionBy == '' || chargeData.actionBy == null ? owner.code : chargeData.actionBy,
        propertyId: chargeData.propertyId,
        propertyUnitId: chargeData.propertyUnitId == '' || chargeData.propertyUnitId == null ? '' : chargeData.propertyUnitId,
        chargeTypeId: chargeData.chargeTypeId,
        currency: currency.symbol,
        amount: chargeData.amount,
        description: chargeData.description,
        status: 1,
        createdOn: DateUtil.currentDate(),
      });

      const savedChargeType = await newCharge.save();

      const action = `New ${moduleName}`;
      const person = chargeData.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, savedChargeType);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getChargesByOwner: async (req, res) => {
    try {
      const creator = req.params.id;

      const owner = await Charge.find({ ownerCode: creator });
      // console.log(owner);

      if (!owner) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      const totalPropertyStatus = await Charge.countDocuments({
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

      const propertyStatus = await Charge.find({ ownerCode: creator })
        .populate(
          [
            { path: "property", select: "id code description" },
            { path: "unit", select: "id code name" },
            { path: "chargeType", select: "id name accountType description" },
          ]
        )
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

  getCharges: async (req, res) => {
    try {
      const totalChargeType = await Charge.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalChargeType
      );

      if (pagination.page > pagination.pages) {
        return res.status(200).json({
          message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
        });
      }

      pagination.data = await Charge.find()
        .populate(
          [
            { path: "property", select: "id code description" },
            { path: "unit", select: "id code name" },
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

  getChargeById: async (req, res) => {
    try {
      const charge = await Charge.findById(req.params.id).populate(
        [
          { path: "property", select: "id code description" },
          { path: "unit", select: "id code name" },
          { path: "chargeType", select: "id name accountType description" },
        ]
      );

      if (!charge) {
        return Response.customResponse(res, 404, ResponseMessage.NO_CHARGE_RECORD);
      }

      return Response.successResponse(res, res.statusCode, charge);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  delete: async (req, res) => {
    try {
      const charge = await Charge.findById(req.params.id);

      if (!charge) {
        return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
      }

      await charge.deleteOne();

      const action = `Deleted ${moduleName} - ${charge.code}`;
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
      const charge = await Charge.findById(req.body.id);

      if (!charge) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      const owner = await PropertyOwner.findById(req.body.propertyId || charge.propertyId);

      charge.ownerCode = req.body.actionBy == '' || req.body.actionBy == null ? charge.code : req.body.actionBy,
      charge.propertyId = req.body.propertyId || charge.propertyId;
      charge.propertyUnitId = req.body.propertyUnitId || charge.propertyUnitId;
      charge.chargeTypeId = req.body.chargeTypeId || charge.chargeTypeId;
      charge.amount = req.body.amount || charge.amount;
      charge.description = req.body.description || charge.description;
      charge.status = req.body.status || charge.status;
      charge.updatedOn = DateUtil.currentDate();

      const updatedCharge = await charge.save();

      const action = `Update ${moduleName}`;
      const person = req.body.actionBy;
      await createActivityLog(charge, action, person);

      return Response.successResponse(res, res.statusCode, updatedCharge);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },
};
