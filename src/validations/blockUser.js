const Joi = require("joi");

const blockUserValidation = (data) => {
    const schema = Joi.object({
        blockerId: Joi.string().required(),
        targetUserId: Joi.string().required()
    });
    return schema.validate(data);
};

module.exports.blockUserValidation = blockUserValidation;
