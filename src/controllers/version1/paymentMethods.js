// MODELS
const PaymentMethod = require("../../models/paymentMethods");

// VALIDATIONS
const { paymentMethodValidation } = require("../../validations/paymentMethods");

// UTILITIES
const Response = require("../../utilities/response_utility");
const DateUtil = require("../../utilities/date_utility");

const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `PaymentMethod`;

module.exports = {
  create: async (req, res) => {
    try {
      const propertyTypeData = req.body;

      const { error } = paymentMethodValidation(propertyTypeData);

      if (error) {
        return Response.errorResponse(res, 400, error);
      }

      const newPaymentMethod = new PaymentMethod({
        ownerCode: propertyTypeData.actionBy,
        name: propertyTypeData.name,
        description: propertyTypeData.description,
        status: 1,
        createdOn: DateUtil.currentDate(),
      });

      const savedPaymentMethod = await newPaymentMethod.save();

      const action = `New ${moduleName}`;
      const person = propertyTypeData.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, savedPaymentMethod);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getPaymentMethod: async (req, res) => {
    try {
      const totalPaymentMethod = await PaymentMethod.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalPaymentMethod
      );

      if (pagination.page > pagination.pages) {
        return res.status(200).json({
          message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
        });
      }

      pagination.data = await PaymentMethod.find()
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

  getPaymentMethodById: async (req, res) => {
    try {
      const propertyTypeId = req.params.id;

      const paymentMethod = await PaymentMethod.findById(propertyTypeId).select(
        "-updatedOn -createdOn"
      );

      if (!paymentMethod) {
        return Response.errorResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      paymentMethod.id = paymentMethod._id.toHexString();

      return Response.successResponse(res, res.statusCode, paymentMethod);
    } catch (err) {
      return Response.errorResponse(res, 500, err.message);
    }
  },

  delete: async (req, res) => {
    try {
      const paymentMethod = await PaymentMethod.findById(req.params.id);

      if (!paymentMethod) {
        return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
      }

      await paymentMethod.deleteOne();

      const action = `Deleted ${moduleName} - ${paymentMethod.code}`;
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
      const paymentMethod = await PaymentMethod.findById(req.body.id);

      if (!paymentMethod) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      paymentMethod.ownerCode = req.body.actionBy || paymentMethod.ownerCode;
      paymentMethod.name = req.body.name || paymentMethod.name;
      paymentMethod.description =
        req.body.description || paymentMethod.description;
      paymentMethod.status =
        req.body.status;
      paymentMethod.updatedOn = DateUtil.currentDate();

      const updatedPaymentMethod = await paymentMethod.save();

      const action = `Update ${moduleName}`;
      const person = req.body.actionBy;
      await createActivityLog(paymentMethod, action, person);

      return Response.successResponse(res, res.statusCode, updatedPaymentMethod);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },
};
