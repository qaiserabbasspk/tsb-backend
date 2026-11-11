// MODELS
const Currency = require("../../models/currencies");
const SubscriptionPlan = require("../../models/subscriptionPlans");

// VALIDATIONS
const { subscriptionPlanValidation } = require("../../validations/subcriptionPlans");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const { status } = require("../../utilities/status_change_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");
// live key
const stripe = require('stripe')('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');
// test key for testing
//const stripe = require('stripe')('sk_test_51M4faDIJ5Vh9F5wkj8BTsmpZawTsNrCk1AqeeAuvSkNZ77DRtZVubQKvY4d2R7apADw86phVINocKygK6tLKVQ4L00Tdbw7ZXG');

const moduleName = `SubscriptionPlan`;

module.exports = {
  createSubscriptionPlan: async (req, res) => {
    try {
      const body = req.body;

      const { error } = subscriptionPlanValidation(body);

      if (error) {
        return Response.sendValidationErrorMessage(res, 400, error);
      }

      const currency = await Currency.findById(body.currencyId);
      // console.log("test: " + currency);

      if (!currency) {
        return Response.customResponse(res, 404, ResponseMessage.NO_CURRENCY_RECORD);
      }

      const existingSubscriptionPlan = await SubscriptionPlan.findOne({
        name: body.name,
      });

      if (existingSubscriptionPlan) {
        return Response.customResponse(res, 409, ResponseMessage.DATA_EXISTS);
      }

      const subscriptionPlan = new SubscriptionPlan({
        name: body.name,
        currency: currency.symbol,
        amount: body.amount,
        description: body.description,
        status: body.status || 1,
        ownerCode: body.actionBy,
        createdOn: DateUtil.currentDate(),
      });

      const newSubscriptionPlan = await subscriptionPlan.save();

      const action = `New ${moduleName} - ${body.symbol}`;
      const person = body.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, newSubscriptionPlan);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getSubscriptionsByOwner: async (req, res) => {
    try {
      const creator = req.params.id;

      const owner = await SubscriptionPlan.find({ ownerCode: creator });
      // console.log(owner);

      if (!owner) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      const totalPlans = await SubscriptionPlan.countDocuments({
        ownerCode: creator,
      });


      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalPlans
      );

      if (pagination.page > pagination.pages) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.OUTOF_DATA
        );
      }

      const propertyStatus = await SubscriptionPlan.find({ ownerCode: creator })
        .select("-createdOn -updatedOn")
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      pagination.data = propertyStatus.map((pagination) => {
        pagination.id = pagination._id.toHexString();
        return pagination;
      });

      pagination.rows = totalPlans;

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getSubscriptions: async (req, res) => {
    try {
      const totalSubscriptionPlan = await SubscriptionPlan.countDocuments();

      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalSubscriptionPlan
      );

      if (pagination.page > pagination.pages) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.OUTOF_DATA
        );
      }

      pagination.data = await SubscriptionPlan.find()
        .skip(skip)
        .limit(pagination.pageSize);

      if (totalSubscriptionPlan === 0) {
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

  getSubscriptionPlan: async (req, res) => {
    try {
      const subscriptionPlan = await SubscriptionPlan.findById(req.params.id);

      if (!subscriptionPlan) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      return Response.successResponse(res, res.statusCode, subscriptionPlan);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  updateSubscriptionPlan: async (req, res) => {
    try {
      const body = req.body;
      const subscriptionPlan = await SubscriptionPlan.findById(body.id);

      if (!subscriptionPlan) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      subscriptionPlan.name = body.name || subscriptionPlan.name;
      subscriptionPlan.description = body.description || subscriptionPlan.description;
      subscriptionPlan.amount = body.amount || subscriptionPlan.amount;
      subscriptionPlan.status = body.status;
      subscriptionPlan.ownerCode = body.actionBy || subscriptionPlan.ownerCode;
      subscriptionPlan.updatedOn = DateUtil.currentDate();

      const updatedSubscriptionPlan = await subscriptionPlan.save();

      const action = `Updated ${moduleName} - ${subscriptionPlan.symbol}`;
      const person = body.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, updatedSubscriptionPlan);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  deleteSubscriptionPlan: async (req, res) => {
    try {
      const param = req.params;
      const subscriptionPlan = await SubscriptionPlan.findById(param.id);

      if (!subscriptionPlan) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      await subscriptionPlan.deleteOne();

      const action = `Deleted ${moduleName} - ${subscriptionPlan.symbol}`;
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

  deActivateAndActivate: async (req, res) => {
    await status(req, res, SubscriptionPlan, moduleName);
  },

  makePayment: async (req, res) => {
    const name = encodeURIComponent(req.body.name);
    const amount = encodeURIComponent(req.body.amount);
    const ownerId = encodeURIComponent(req.body.ownerId);
    const subscriptionId = encodeURIComponent(req.body.subscriptionId);

    const success_url = `https://admin.rentrack.org/#/dashboard?success=true&name=${name}&amount=${amount}&ownerId=${ownerId}&subscriptionId=${subscriptionId}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: req.body.name
            },
            unit_amount: req.body.amount // $19.99
          },
          quantity: req.body.quantity
        }
      ],
      mode: 'payment',
      success_url: success_url,
      cancel_url: 'https://admin.rentrack.org/#/dashboard',
      billing_address_collection: 'auto'
    });

    //res.json({ id: session.id });
    return res.status(200).json({
      id: session.id
    });
  }
};
