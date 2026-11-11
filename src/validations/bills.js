const Joi = require("joi");

const billsValidation = (data) => {
    const schema = Joi.object({
        title: Joi.string().required(),
        reason: Joi.string().required(),
        remark: Joi.string().allow(""),
        attachments: Joi.array()
            .items(
                Joi.object({
                    name: Joi.string().required(),
                })
            ),
        ownerId: Joi.string().required(),
        tenantId: Joi.string().required(),
        actionBy: Joi.string().required(),
    });
    return schema.validate(data);
};

module.exports.billsValidation = billsValidation;
