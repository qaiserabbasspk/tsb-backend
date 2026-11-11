const Joi = require("joi");

const conversationValidation = (data) => {
    const schema = Joi.object({
        userId: Joi.string().required(),
        hostId: Joi.string().required(),
    });
    return schema.validate(data);
};

module.exports.conversationValidation = conversationValidation;
