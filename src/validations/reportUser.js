const Joi = require("joi");

const reportUserValidation = (data) => {
    const schema = Joi.object({
        reporterId: Joi.string().required(),
        targetUserId: Joi.string().required(),
        reasonId: Joi.string().required()
    });
    return schema.validate(data);
};

module.exports.reportUserValidation = reportUserValidation;
