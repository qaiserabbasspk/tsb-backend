const Joi = require("joi");

const ALLOWED_MOODS = [
    "romantic",
    "family",
    "business",
    "beach",
    "budget",
    "adventure",
    "quiet",
    "party",
];

const aiConciergeValidation = (data) => {
    const schema = Joi.object({
        prompt: Joi.string().trim().max(400).allow("").optional(),
        moods: Joi.array().items(Joi.string().valid(...ALLOWED_MOODS)).max(8).optional(),
    }).custom((value, helpers) => {
        if (!value.prompt && !(value.moods && value.moods.length)) {
            return helpers.error("any.custom", { message: "Provide a description or pick at least one mood." });
        }
        return value;
    });
    return schema.validate(data);
};

module.exports.aiConciergeValidation = aiConciergeValidation;
module.exports.ALLOWED_MOODS = ALLOWED_MOODS;
