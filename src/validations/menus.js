const Joi = require("joi");

const menuValidation = (data) => {
  const schema = Joi.object({
    parent: Joi.string(),
    name: Joi.string().min(3).required(),
    order: Joi.number().required(),
    url: Joi.string().allow(""),
    status: Joi.number().integer().min(0).max(1).integer().min(0).max(1),
    actionBy: Joi.string().required(),
  });
  return schema.validate(data);
};

module.exports.menuValidation = menuValidation;
