const Joi = require("joi");

// A deal is created with either a straight percentage or a flat amount —
// never both, never neither. The amount's upper bound depends on the
// room's own price, which isn't known here, so that check happens in the
// controller once the room is loaded; this only enforces the shape/one-of.
const hotDealValidation = (data) => {
    const schema = Joi.object({
        roomId: Joi.string().required(),
        hostId: Joi.string().required(),
        discountPercent: Joi.number().min(0).max(100),
        discountAmount: Joi.number().min(0),
        endDate: Joi.date().optional().allow(null),
    }).xor("discountPercent", "discountAmount");
    return schema.validate(data);
};

// Editing a deal only ever changes its discount/expiry — the room it
// applies to is fixed (see hotDeals.js update), so roomId/hostId are
// intentionally absent here.
const hotDealUpdateValidation = (data) => {
    const schema = Joi.object({
        discountPercent: Joi.number().min(0).max(100),
        discountAmount: Joi.number().min(0),
        endDate: Joi.date().optional().allow(null),
    }).xor("discountPercent", "discountAmount");
    return schema.validate(data);
};

module.exports.hotDealValidation = hotDealValidation;
module.exports.hotDealUpdateValidation = hotDealUpdateValidation;
