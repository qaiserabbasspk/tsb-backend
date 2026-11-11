const Joi = require("joi");

const featureValidation = (data) => {
    const schema = Joi.object({
        title: Joi.string().required(),
        subtitle: Joi.string().required(),
        icon: Joi.string().required(),
        iconCodePoint: Joi.string().required(),
        actionBy: Joi.string().required(),
    });
    return schema.validate(data);
};

module.exports.featureValidation = featureValidation;
