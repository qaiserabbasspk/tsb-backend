const Joi = require("joi");

const appointmentValidation = (data) => {
  const schema = Joi.object({
    propertyUnitId: Joi.string().required(),
    fullName: Joi.string().required(),
    email: Joi.string().required(),
    phone: Joi.string().required(),
    appointmentDate: Joi.string().required(),
    appointmentTime: Joi.string().required(),
    comments: Joi.string().allow(""),
    actionBy: Joi.string().allow(""),
  });

  return schema.validate(data);
};

module.exports.appointmentValidation = appointmentValidation;
