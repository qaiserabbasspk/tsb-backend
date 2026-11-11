const Joi = require("joi");

// address/location are deliberately optional — a property can be created
// with just a name (e.g. from a future "create property first" flow before
// any room exists), and the funnel that creates a property inline from the
// room-creation form fills these in from the room's own address as a
// convenience default rather than a hard requirement.
const roomPropertyValidation = (data) => {
    const schema = Joi.object({
        hostId: Joi.string().required(),
        name: Joi.string().required(),
        categoryId: Joi.string().required(),
        address: Joi.object({
            country: Joi.string().allow(""),
            city: Joi.string().allow(""),
            street: Joi.string().allow(""),
        }),
        location: Joi.object({
            latitude: Joi.number().required(),
            longitude: Joi.number().required(),
        }),
    });
    return schema.validate(data);
};

module.exports.roomPropertyValidation = roomPropertyValidation;
