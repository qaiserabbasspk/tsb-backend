const Joi = require("joi");

const invoiceValidation = (data) => {
  const schema = Joi.object({
    tenantId: Joi.string().allow(''),
    propertyId: Joi.string().allow(''),
    propertyUnitId: Joi.string().allow(''),
    paymentPeriodId: Joi.string().allow(''),
    paymentOptionId: Joi.string().allow(''),
    charges: Joi.array().items(
      Joi.object({
        id: Joi.string().allow(''),
      })
    ).required(),
    invoiceDate: Joi.date().required(),
    dueDate: Joi.date().required(),
    actionBy: Joi.string().allow(''),
  });
  return schema.validate(data);
};

module.exports.invoiceValidation = invoiceValidation;
