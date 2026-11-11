const Joi = require("joi");

const subscriptionPlanValidation = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(3).required(),
    currencyId: Joi.string().required(),
    amount: Joi.number().required(),
    description: Joi.string(),
    status: Joi.number().integer().min(0).max(1),
    actionBy: Joi.string().required(),
  });
  return schema.validate(data);
};

module.exports.subscriptionPlanValidation = subscriptionPlanValidation;
