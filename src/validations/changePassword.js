const Joi = require("joi");
const ResponseMessage = require("../utilities/messages_utility");

const changePasswordValidation = (data) => {
  const schema = Joi.object({
    userId: Joi.string().required(),
    oldPassword: Joi.string().required(),
    newPassword: Joi.string()
      .min(6)
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[$@$!%*?&])[A-Za-z\d$@$!%*?&]+$/
      )
      .required()
      .messages({
        "string.pattern.base": ResponseMessage.PASSWORD_VALIDITY,
        "any.required": `${ResponseMessage.NEW_PASSWORD_REQUIRED}`,
      }),
    confirmPassword: Joi.string()
      .valid(Joi.ref("newPassword"))
      .required()
      .messages({
        "any.only": `${ResponseMessage.PASSWORD_MISMATCH}`,
        "any.required": `${ResponseMessage.CONFIRM_PASSWORD_REQUIRED}`,
      }),
  });
  return schema.validate(data);
};

module.exports.changePasswordValidation = changePasswordValidation;
