const Joi = require("joi");

const propertyStatusValidation = (data) => {
  const schema = Joi.object({
    name: Joi.string().required(),
    description: Joi.string(),
    actionBy: Joi.string().required(),
  });
  return schema.validate(data);
};

module.exports.propertyStatusValidation = propertyStatusValidation;
