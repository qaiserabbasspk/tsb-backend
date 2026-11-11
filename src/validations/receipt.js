const Joi = require("joi");

const receiptValidation = (data) => {
    const schema = Joi.object({
        roomId: Joi.string().required(),
        hostId: Joi.string().required(),
        reservationId: Joi.string().required(),
        customerName: Joi.string().required(),
        customerEmail: Joi.string().required(),
        customerPhone: Joi.object({
            code: Joi.string(),
            number: Joi.number(),
        }).required(),
        description: Joi.string().required(),
        totalAmount: Joi.number().required(),
        originalAmount: Joi.number().optional(),
        discountPercent: Joi.number().min(0).max(100).optional(),
        currency: Joi.string().required(),
    });
    return schema.validate(data);
};

module.exports.receiptValidation = receiptValidation;
