const Joi = require("joi");
const { status } = require("../utilities/status_change_utility");

const roleValidation = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(5).required(),
    claims: Joi.array().items().required(),
    description: Joi.string().allow(''),
    status: Joi.number().integer().min(0).max(1).integer().min(0).max(1),
    actionBy: Joi.string().required(),
  });
  return schema.validate(data);
};

module.exports.roleValidation = roleValidation;
