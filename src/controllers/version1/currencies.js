// MODELS
const Currency = require("../../models/currencies");

// VALIDATIONS
const { currencyValidation } = require("../../validations/currencies");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `Currency`;

module.exports = {
  createCurrency: async (req, res) => {
    try {
      const body = req.body;

      const { error } = currencyValidation(body);

      if (error) {
        return Response.sendValidationErrorMessage(res, 400, error);
      }

      const existingCurrency = await Currency.findOne({
        name: body.name,
        symbol: body.symbol,
      });

      if (existingCurrency) {
        return Response.customResponse(res, 409, ResponseMessage.DATA_EXISTS);
      }

      const currency = new Currency({
        ownerCode: body.actionBy,
        name: body.name,
        order: body.order,
        symbol: body.symbol,
        status: body.status,
        createdOn: DateUtil.currentDate(),
      });

      const newCurrency = await currency.save();

      const action = `New ${moduleName} - ${body.symbol}`;
      const person = body.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, newCurrency);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getCurrenciesByOwner: async (req, res) => {
    try {
      const creator = req.params.id;

      const owner = await Currency.find({ ownerCode: creator });
      // console.log(owner);

      if (!owner) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      const totalPropertyStatus = await Currency.countDocuments({
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

      const propertyStatus = await Currency.find({ ownerCode: creator })
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

  getCurrencies: async (req, res) => {
    try {
      const totalCurrency = await Currency.countDocuments();

      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalCurrency
      );

      if (pagination.page > pagination.pages) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.OUTOF_DATA
        );
      }

      pagination.data = await Currency.find()
        .skip(skip)
        .limit(pagination.pageSize);

      if (totalCurrency === 0) {
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

  getCurrency: async (req, res) => {
    try {
      const currency = await Currency.findById(req.params.id);

      if (!currency) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      return Response.successResponse(res, res.statusCode, currency);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  updateCurrency: async (req, res) => {
    try {
      const body = req.body;
      const currency = await Currency.findById(body.id);

      if (!currency) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      currency.ownerCode = body.actionBy || currency.ownerCode;
      currency.name = body.name || currency.name;
      currency.order = body.order || currency.order;
      currency.symbol = body.symbol || currency.symbol;
      currency.status = body.status;
      currency.updatedOn = DateUtil.currentDate();

      const updatedCurrency = await currency.save();

      const action = `Updated ${moduleName} - ${currency.symbol}`;
      const person = body.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, updatedCurrency);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  deleteCurrency: async (req, res) => {
    try {
      const param = req.params;
      const currency = await Currency.findById(param.id);

      if (!currency) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      await currency.deleteOne();

      const action = `Deleted ${moduleName} - ${currency.symbol}`;
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
