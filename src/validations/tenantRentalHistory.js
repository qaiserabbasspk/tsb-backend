const Joi = require("joi");

const tenantRentalHistoryValidation = (data) => {
    const schema = Joi.object({
        tenantName: Joi.string().required(),
        currentAddress: Joi.string().required(),
        propertyMgtCompanyName: Joi.string().required(),
        pointOfContact: Joi.string().required(),
        isResident: Joi.string().required(),
        leaseStartDate: Joi.date().required(),
        leasseEndDate: Joi.date().required(),
        monthlyRent: Joi.number().required(),
        wouldYouRentAgain: Joi.boolean().required(),
        wasVacateNoticeGiven: Joi.boolean().required(),
        havePets: Joi.boolean(),
        pets: Joi.string(),
        petsAllowed: Joi.boolean(),
        latePayments: Joi.boolean().required(),
        anyComplaints: Joi.boolean().required(),
        anyDamages: Joi.boolean().required(),
        anyOverdueBalance: Joi.boolean().required(),
        anyOverdueBalance: Joi.boolean().required(),
    });

    return schema.validate(data);
};

module.exports.tenantRentalHistoryValidation = tenantRentalHistoryValidation;
