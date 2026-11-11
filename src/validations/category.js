const Joi = require("joi");

const categoryValidation = (data) => {
    const schema = Joi.object({
        name: Joi.string().required(),
        image: Joi.string().required(),
        icon: Joi.string().required(),
        iconCodePoint: Joi.string().required(),
        actionBy: Joi.string().required(),
    });
    return schema.validate(data);
};

module.exports.categoryValidation = categoryValidation;
