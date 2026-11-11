const Joi = require("joi");

const currencyValidation = (data) => {
  const schema = Joi.object({
    name: Joi.string().required(),
    order: Joi.number().required(),
    symbol: Joi.string().required(),
    status: Joi.number().integer().min(0).max(1),
    actionBy: Joi.string().required(),
  });
  return schema.validate(data);
};

module.exports.currencyValidation = currencyValidation;
