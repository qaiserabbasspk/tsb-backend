const Joi = require("joi");

const wishListValidation = (data) => {
    const schema = Joi.object({
        roomId: Joi.string().required(),
        userId: Joi.string().required(),
    });
    return schema.validate(data);
};

module.exports.wishListValidation = wishListValidation;
