const Joi = require("joi");

const leaseValidation = (data) => {
    const schema = Joi.object({
        title: Joi.string().required(),
        remark: Joi.string().allow(""),
        fromDate: Joi.string().required(),
        toDate: Joi.string().required(),
        attachments: Joi.array()
            .items(
                Joi.object({
                    name: Joi.string().required(),
                })
            ),
        ownerId: Joi.string().required(),
        tenantId: Joi.string().required(),
        propertyId: Joi.string().required(),
        propertyUnitId: Joi.string().required(),
        actionBy: Joi.string().required(),
    });
    return schema.validate(data);
};

module.exports.leaseValidation = leaseValidation;
