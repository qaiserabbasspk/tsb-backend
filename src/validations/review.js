const Joi = require("joi");

const reviewValidation = (data) => {
    const schema = Joi.object({
        review: Joi.string().allow('').optional(),
        roomId: Joi.string().required(),
        userId: Joi.string().required(),
        hostId: Joi.string().required(),
        rating: Joi.number().integer().min(1).max(5).optional(),
    });
    return schema.validate(data);
};

module.exports.reviewValidation = reviewValidation;
