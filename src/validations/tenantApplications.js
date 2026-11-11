const Joi = require("joi");

const tenantApplicationValidation = (data) => {
    const schema = Joi.object({
        tenantId: Joi.string().required(),
        propertyId: Joi.string().required(),
        propertyUnitId: Joi.string().required(),
        documents: Joi.array()
            .items(
                Joi.object({
                    id: Joi.string().required(),
                    documentName: Joi.string().required(),
                })
            )
            .min(1)
            .required(),   
        actionBy: Joi.string().allow(""),
        // messageStatus: Joi.number().integer().valid(0, 1, 2).required(),
    });

    return schema.validate(data);
};

module.exports.tenantApplicationValidation = tenantApplicationValidation;
