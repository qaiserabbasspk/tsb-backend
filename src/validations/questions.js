const Joi = require("joi");

const questionValidation = (data) => {
  const schema = Joi.object({
    name: Joi.string().required(),
    category: Joi.string().required(),
    status: Joi.number().integer().min(0).max(1).integer().min(0).max(1),
    actionBy: Joi.string().required(),
  });
  return schema.validate(data);
};

module.exports.questionValidation = questionValidation;
