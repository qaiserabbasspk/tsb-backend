const Joi = require("joi");

const applicationFeeValidation = (data) => {
  const schema = Joi.object({
    name: Joi.string().required(),
    description: Joi.string(),
    amount: Joi.number().required(),
    currencyId: Joi.string().required(),
    chargeTypeId: Joi.string().required(),
    ownerCode: Joi.string().required(),
  });
  return schema.validate(data);
};

module.exports.applicationFeeValidation = applicationFeeValidation;
