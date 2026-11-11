const Joi = require("joi");

const blogValidation = (data) => {
    const schema = Joi.object({
        title: Joi.string().required(),
        slug: Joi.string().required(),
        content: Joi.string().required(),
        featuredImage: Joi.string().required(),
        publisher: Joi.string().required(),
        location: Joi.string().required(),
        isActive: Joi.boolean().required(),
    });
    return schema.validate(data);
};

module.exports.blogValidation = blogValidation;
