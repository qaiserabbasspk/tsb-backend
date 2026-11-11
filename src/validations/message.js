const Joi = require("joi");

const messageValidation = (data) => {
    const schema = Joi.object({
        //conversationId: Joi.string().required(),
        senderId: Joi.string().required(),
        receiverId: Joi.string().required(),
        text: Joi.string().required()
    });
    return schema.validate(data);
};

module.exports.messageValidation = messageValidation;
