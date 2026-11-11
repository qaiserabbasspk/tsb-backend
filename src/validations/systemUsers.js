const Joi = require("joi");

const systemUserValidation = (data) => {
  const schema = Joi.object({
    name: Joi.string().required(),
    email: Joi.string().min(4).required().email(),
    password: Joi.string()
      .min(6)
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[$@$!%*?&])[A-Za-z\d$@$!%*?&]+$/
      )
      .message(
        "Password must be atleast six characters long, must contain an uppercase and lowercase letter, a number and a special character"
      )
      .required(),
    phone: Joi.object({
      code: Joi.string(),
      number: Joi.number(),
    }).allow(null),
    address: Joi.object({
      city: Joi.string().required(),
      zipcode: Joi.string().required(),
      state: Joi.string().allow(""),
    }).allow(null),
    avatar: Joi.string(),
    status: Joi.number().integer().min(0).max(1),
    roleId: Joi.string().allow(""),
    // actionBy: Joi.string().allow(""),
    actionBy: Joi.string().required(),
    isOwner: Joi.number(),
  });
  return schema.validate(data);
};

module.exports.systemUserValidation = systemUserValidation;
