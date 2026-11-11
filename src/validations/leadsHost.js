const Joi = require("joi");

const leadsHostValidation = (data) => {
    const schema = Joi.object({
        name: Joi.string().required(),
        email: Joi.string().min(4).required().email(),
        phone: Joi.object({
            code: Joi.string(),
            number: Joi.number(),
        }).allow(null),
        businessName: Joi.string().required(),
        categoryId: Joi.string().required(),
    });
    return schema.validate(data);
};

module.exports.leadsHostValidation = leadsHostValidation;
