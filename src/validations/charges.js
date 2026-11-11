const Joi = require("joi");

const chargeValidation = (data) => {
  const schema = Joi.object({
    propertyId: Joi.string().required(),
    propertyUnitId: Joi.string().allow(""),
    chargeTypeId: Joi.string().required(),
    currencyId: Joi.string().required(),
    amount: Joi.number().required(),
    description: Joi.string(),
    actionBy: Joi.string().allow(''),
  });
  return schema.validate(data);
};

module.exports.chargeValidation = chargeValidation;
