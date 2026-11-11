// MODELS
const PaymentPeriod = require("../../models/paymentPeriods");

// VALIDATIONS
const { paymentPeriodValidation } = require("../../validations/paymentPeriods");

// UTILITIES
const Response = require("../../utilities/response_utility");
const DateUtil = require("../../utilities/date_utility");

const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `PaymentPeriod`;

module.exports = {
  create: async (req, res) => {
    try {
      const paymentPeriodData = req.body;

      const { error } = paymentPeriodValidation(paymentPeriodData);

      if (error) {
        return Response.errorResponse(res, 400, error);
      }

      const newPaymentPeriod = new PaymentPeriod({
        ownerCode: paymentPeriodData.actionBy,
        name: paymentPeriodData.name,
        description: paymentPeriodData.description,
        status: 1,
        createdOn: DateUtil.currentDate(),
      });

      const savedPaymentPeriod = await newPaymentPeriod.save();

      const action = `New ${moduleName}`;
      const person = paymentPeriodData.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, savedPaymentPeriod);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getPaymentPeriod: async (req, res) => {
    try {
      const totalPaymentPeriod = await PaymentPeriod.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalPaymentPeriod
      );

      if (pagination.page > pagination.pages) {
        return res.status(200).json({
          message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
        });
      }

      pagination.data = await PaymentPeriod.find()
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

  getPeriodsByOwner: async (req, res) => {
    try {
      const creator = req.params.id;

      const owner = await PaymentPeriod.find({ ownerCode: creator });
      // console.log(owner);

      if (!owner) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      const totalPropertyStatus = await PaymentPeriod.countDocuments({
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

      const propertyStatus = await PaymentPeriod.find({ ownerCode: creator })
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

  getPaymentPeriodById: async (req, res) => {
    try {
      const propertyTypeId = req.params.id;

      const paymentPeriod = await PaymentPeriod.findById(propertyTypeId).select(
        "-updatedOn -createdOn"
      );

      if (!paymentPeriod) {
        return Response.errorResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      paymentPeriod.id = paymentPeriod._id.toHexString();

      return Response.successResponse(res, res.statusCode, paymentPeriod);
    } catch (err) {
      return Response.errorResponse(res, 500, err.message);
    }
  },

  delete: async (req, res) => {
    try {
      const paymentPeriod = await PaymentPeriod.findById(req.params.id);

      if (!paymentPeriod) {
        return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
      }

      await paymentPeriod.deleteOne();

      const action = `Deleted ${moduleName} - ${paymentPeriod.code}`;
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
      const paymentPeriod = await PaymentPeriod.findById(req.body.id);

      if (!paymentPeriod) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      paymentPeriod.ownerCode = req.body.actionBy || paymentPeriod.ownerCode;
      paymentPeriod.name = req.body.name || paymentPeriod.name;
      paymentPeriod.description =
        req.body.description || paymentPeriod.description;
      paymentPeriod.status =
        req.body.status;
      paymentPeriod.updatedOn = DateUtil.currentDate();

      const updatedPaymentPeriod = await paymentPeriod.save();

      const action = `Update ${moduleName}`;
      const person = req.body.actionBy;
      await createActivityLog(paymentPeriod, action, person);

      return Response.successResponse(res, res.statusCode, updatedPaymentPeriod);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },
};
