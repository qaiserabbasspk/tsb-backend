const Joi = require("joi");

const documentValidation = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(3).required(),
    status: Joi.number().integer().min(0).max(1).integer().min(0).max(1),
    actionBy: Joi.string().required(),
  });
  return schema.validate(data);
};

module.exports.documentValidation = documentValidation;
