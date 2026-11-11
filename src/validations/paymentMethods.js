const Joi = require("joi");

const paymentMethodValidation = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(3).required(),
    description: Joi.string(),
    actionBy: Joi.string().required(),
  });
  return schema.validate(data);
};

module.exports.paymentMethodValidation = paymentMethodValidation;
