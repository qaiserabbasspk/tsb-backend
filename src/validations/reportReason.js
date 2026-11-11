const Joi = require("joi");

const reportReasonValidation = (data) => {
    const schema = Joi.object({
        reason: Joi.string().required(),
        actionBy: Joi.string().required(),
    });
    return schema.validate(data);
};

module.exports.reportReasonValidation = reportReasonValidation;
