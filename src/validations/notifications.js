const Joi = require("joi");

const notificationValidation = (data) => {
    const schema = Joi.object({
        senderId: Joi.string().required(),
        senderType: Joi.string()
            .valid("Tenant", "PropertyOwner")
            .required(),
        recipients: Joi.array()
            .items(
                Joi.object({
                    receiverId: Joi.string().required(),
                    receiverType: Joi.string().valid("Tenant", "PropertyOwner").required(),
                })
            )
            .min(1)
            .required(),
        message: Joi.string().required(),
        // attachment: Joi.string().uri().optional(),
        attachment: Joi.string().allow(''),
        status: Joi.number().integer().valid(0, 1).optional(),
    });

    return schema.validate(data);
};

module.exports.notificationValidation = notificationValidation;
