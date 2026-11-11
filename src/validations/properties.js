const Joi = require("joi");

const propertyValidation = (data) => {
  const schema = Joi.object({
    status: Joi.number().integer().min(0).max(1),
    description: Joi.string().allow(""),
    buildYear: Joi.string().allow(""),
    avatar: Joi.string().required(),
    address: Joi.object({
      city: Joi.string().allow(""),
      zipcode: Joi.string().allow(""),
      state: Joi.string().allow(""),
    }).allow(null),
    propertyTypeId: Joi.string().required(),
    propertyOwnerId: Joi.string().required(),
    propertyCategoryId: Joi.string().required(),
    actionBy: Joi.string().required(),
  });
  return schema.validate(data);
};

module.exports.propertyValidation = propertyValidation;
