const Joi = require("joi");

const guestRegisterValidation = (data) => {
    const schema = Joi.object({
        firstName: Joi.string().min(2).required(),
        lastName: Joi.string().min(2).required(),
        email: Joi.string().min(4).email().required(),
        password: Joi.string().min(6).max(1024).required(),
        phone: Joi.string().allow("", null),
        avatar: Joi.string().allow("", null),
    });
    return schema.validate(data);
};

const guestLoginValidation = (data) => {
    const schema = Joi.object({
        email: Joi.string().min(4).email().required(),
        password: Joi.string().min(6).max(1024).required(),
    });
    return schema.validate(data);
};

module.exports = { guestRegisterValidation, guestLoginValidation };
