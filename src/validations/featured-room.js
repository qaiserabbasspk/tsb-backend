const Joi = require("joi");

const featuredRoomsValidation = (data) => {
    const schema = Joi.object({
        roomId: Joi.string().required(),
        hostId: Joi.string().required(),
    });
    return schema.validate(data);
};

module.exports.featuredRoomsValidation = featuredRoomsValidation;
