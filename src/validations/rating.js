const Joi = require("joi");

const ratingValidation = (data) => {
    const schema = Joi.object({
        roomRate: Joi.number().required(),
        hostRate: Joi.number().required(),
        roomId: Joi.string().required(),
        userId: Joi.string().required(),
        hostId: Joi.string().required(),
    });
    return schema.validate(data);
};

module.exports.ratingValidation = ratingValidation;
