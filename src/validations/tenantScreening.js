const Joi = require("joi");

const tenantScreeningValidation = (data) => {
    const schema = Joi.object({
        profileInformation: Joi.object({
            tenantName: Joi.string().allow(null),
            phone: Joi.object({
                code: Joi.string().allow(null),
                number: Joi.number(),
            }).allow(null),
            address: Joi.object({
                city: Joi.string().allow(null),
                state: Joi.string().allow(null),
                zipcode: Joi.string().allow(null),
            }).allow(null),
        }).allow(null),
        emergencyContact: Joi.object({
            emergencyName: Joi.string().allow(null),
            phone: Joi.object({
                code: Joi.string().allow(null),
                number: Joi.number(),
            }).allow(null),
            address: Joi.object({
                city: Joi.string().allow(null),
                state: Joi.string().allow(null),
                zipcode: Joi.string().allow(null),
            }).allow(null),
        }).allow(null),
        currentAddress: Joi.object({
            QA: Joi.object({
                question: Joi.string().allow(null),
                answer: Joi.string().allow(null),
            }).allow(null),
            propertyAddress: Joi.string().allow(null),
            unit: Joi.string().allow(null),
            city: Joi.string().allow(null),
            state: Joi.string().allow(null),
            zipcode: Joi.string().allow(null),
            moveInDate: Joi.date().allow(null),
            moveOutDate: Joi.date().allow(null),
            monthlyRent: Joi.object({
                currency: Joi.string().allow(null),
                amount: Joi.string().allow(null),
            }).allow(null),
            landLord: Joi.object({
                name: Joi.string().allow(null),
                email: Joi.string().allow(null),
                phone: Joi.object({
                    code: Joi.string().allow(null),
                    number: Joi.string().allow(null),
                }).allow(null),
            }).allow(null),
        }).allow(null),   
        reasonForLeaving: Joi.string().allow(null),
        actionBy: Joi.string().allow(null),
        // messageStatus: Joi.number().integer().valid(0, 1, 2).required(),
    });

    return schema.validate(data);
};

module.exports.tenantScreeningValidation = tenantScreeningValidation;
