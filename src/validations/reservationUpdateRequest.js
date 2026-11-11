const Joi = require("joi");

const reservationUpdateRequestValidation = (data) => {
    const schema = Joi.object({
        reservationId: Joi.string().required(),
        checkIn: Joi.string().required(),
        checkOut: Joi.string().required(),
        message: Joi.string().required(),
    });
    return schema.validate(data);
};

module.exports.reservationUpdateRequestValidation = reservationUpdateRequestValidation;
