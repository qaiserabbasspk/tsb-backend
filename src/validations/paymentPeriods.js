const Joi = require("joi");

const paymentPeriodValidation = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(3).required(),
    description: Joi.string(),
    actionBy: Joi.string().required(),
  });
  return schema.validate(data);
};

module.exports.paymentPeriodValidation = paymentPeriodValidation;
