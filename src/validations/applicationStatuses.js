const Joi = require("joi");

const applicationStatusValidation = (data) => {
  const schema = Joi.object({
    name: Joi.string().required(),
    description: Joi.string(),
    actionBy: Joi.string().required(),
  });
  return schema.validate(data);
};

module.exports.applicationStatusValidation = applicationStatusValidation;
