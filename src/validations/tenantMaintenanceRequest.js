const Joi = require("joi");

const tenantMaintenanceRequestValidation = (data) => {
    const schema = Joi.object({
        propertyId: Joi.string().required(),
        propertyUnitId: Joi.string().required(),
        tenantId: Joi.string().required(),
        gallery: Joi.array()
            .items(
                Joi.object({
                    name: Joi.string().required(),
                })
            )
            .min(1)
            .required(),
        message: Joi.string().required(),
        actionBy: Joi.string().required(),
        // messageStatus: Joi.number().integer().valid(0, 1, 2).required(),
    });

    return schema.validate(data);
};

module.exports.tenantMaintenanceRequestValidation = tenantMaintenanceRequestValidation;
