const Joi = require("joi");

const propertyUnitValidation = (data) => {

  const schema = Joi.object({
    status: Joi.number().integer().min(0).max(1),
    name: Joi.string().required(),
    description: Joi.string().allow(""),
    ownerCode: Joi.string().allow(""),
    currency: Joi.string().required(),
    price: Joi.number(),
    size: Joi.number(),
    unit: Joi.string().required(),
    bedRoom: Joi.number(),
    bathRoom: Joi.number(),
    kitchen: Joi.number(),
    parking: Joi.number(),
    propertyId: Joi.string().required(),
    propertyStatusId: Joi.string().required(),
    gallery: Joi.array()
      .items(
        Joi.object({
          name: Joi.string().allow(""),
        })
      )
      .allow(null),
    actionBy: Joi.string().required(),
  });
  return schema.validate(data);
};

module.exports.propertyUnitValidation = propertyUnitValidation;
