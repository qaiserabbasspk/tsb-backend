const Joi = require("joi");

const roomsValidation = (data) => {
    const schema = Joi.object({
        title: Joi.string().required(),
        subtitle: Joi.string().required(),
        description: Joi.string().required(),
        quantity: Joi.number().required(),
        //availableRooms: Joi.number().required(),
        gallery: Joi.array()
            .items(
                Joi.object({
                    name: Joi.string().allow(""),
                })
            ),
        // Optional: Strictly allow YouTube links (youtube.com or youtu.be). The
        // controller normalizes this to an embeddable URL on save/update.
        youtubeUrl: Joi.string()
            .uri()
            .pattern(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i)
            .allow(null, ""),
        location: Joi.object({
            latitude: Joi.number().required(),
            longitude: Joi.number().required(),
        }),
        amenities: Joi.array().items(
            Joi.object({
                id: Joi.string().required(),
            })
        ).required(),
        address: Joi.object({
            country: Joi.string().required(),
            city: Joi.string().required(),
            street: Joi.string().required(),
        }),
        price: Joi.number().required(),
        // Optional: the host's own rating for their property. Left unset, the
        // room stays flagged as pending a host rating (see hostRatingSet on
        // the Room model).
        rating: Joi.number().min(0).max(5).allow(null),
        hasRefundableCautionFee: Joi.boolean(),
        refundableCautionFee: Joi.number(),
        currency: Joi.string().required(),
        guests: Joi.number().required(),
        bedroom: Joi.number().required(),
        bed: Joi.number().required(),
        bath: Joi.number().required(),
        hostId: Joi.string().required(),
        // Optional: set when the host picked/created a property on the Add
        // Room form (see resolveRoomPropertyId in the rooms controller).
        // Omitted, it falls back to a fresh single-room property.
        propertyId: Joi.string().allow(null),
        features: Joi.array().items(
            Joi.object({
                id: Joi.string().required(),
            })
        ).required(),
        categoryId: Joi.string().required(),
        status: Joi.number().integer().min(0).max(1),
    });
    return schema.validate(data);
};

module.exports.roomsValidation = roomsValidation;
