const Joi = require("joi");

const reservationValidation = (data) => {
    const schema = Joi.object({
        userId: Joi.string().allow(null),
        isSignedIn: Joi.number().required(),
        customerName: Joi.string().required(),
        customerEmail: Joi.string().required(),
        customerPhone: Joi.object({
            code: Joi.string(),
            number: Joi.number(),
        }).required(),
        hostId: Joi.string().allow(null, '').optional(),
        roomId: Joi.string().required(),
        checkIn: Joi.string().required(),
        checkOut: Joi.string().required(),
        message: Joi.string().allow(null, '').optional(),
        isPaid: Joi.number().required(),
        quantity: Joi.number().integer().min(1).default(1).optional(),
        txRef: Joi.when('isPaid', {
            is: 1,
            then: Joi.string().required(),
            otherwise: Joi.string().allow(null, '').optional(),
        }),
        transactionId: Joi.when('isPaid', {
            is: 1,
            then: Joi.string().required(),
            otherwise: Joi.string().allow(null, '').optional(),
        }),
        twclid: Joi.string().allow(null, '').optional(),
        gaClientId: Joi.string().allow(null, '').optional(),
        // Was already being read off req.body (guestCurrency) without being
        // declared here — Joi rejects unknown keys by default, so any request
        // that actually needed currency conversion was silently 400ing.
        guestCurrency: Joi.string().allow(null, '').optional(),
        customerCountry: Joi.string().allow(null, '').optional(),
    });
    return schema.validate(data);
};

module.exports.reservationValidation = reservationValidation;
