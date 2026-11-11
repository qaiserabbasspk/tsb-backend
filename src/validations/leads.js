const Joi = require("joi");

const leadsValidation = (data) => {
    const schema = Joi.object({
        name: Joi.string().required(),
        email: Joi.string().min(4).required().email(),
        phone: Joi.object({
            code: Joi.string(),
            number: Joi.number(),
        }).allow(null),
    });
    return schema.validate(data);
};

module.exports.leadsValidation = leadsValidation;
