const Joi = require("joi");

const propertyTypeValidation = (data) => {
  const schema = Joi.object({
    name: Joi.string().required(),
    description: Joi.string(),
    actionBy: Joi.string().required(),
  });
  return schema.validate(data);
};

module.exports.propertyTypeValidation = propertyTypeValidation;
