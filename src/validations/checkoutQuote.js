const Joi = require("joi");

const checkoutQuoteValidation = (data) => {
    const schema = Joi.object({
        roomId: Joi.string().hex().length(24).required(),
        txRef: Joi.string().trim().min(3).max(120).required(),
        guestCurrency: Joi.string().trim().length(3).uppercase().required(),
    });
    return schema.validate(data);
};

module.exports.checkoutQuoteValidation = checkoutQuoteValidation;
