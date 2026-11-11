const Joi = require("joi");

const chargeTypeValidation = (data) => {
  const schema = Joi.object({
    description: Joi.string(),
    name: Joi.string().min(3).required(),
    accountTypeId: Joi.string().required(),
    actionBy: Joi.string().required(),
  });
  return schema.validate(data);
};

module.exports.chargeTypeValidation = chargeTypeValidation;
