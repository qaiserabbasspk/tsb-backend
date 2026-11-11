const Joi = require("joi");

const contactUsValidation = (data) => {
  const schema = Joi.object({
    fullName:Joi.string().required(),
    phoneNumber:Joi.string().required(),
    email: Joi.string().min(4).required().email(),
    subject: Joi.string().required(),
    message: Joi.string().required(),
  });
  return schema.validate(data);
};

module.exports.contactUsValidation = contactUsValidation;
