const Joi = require("joi");

const hostsValidation = (data) => {
    const schema = Joi.object({
        name: Joi.string().required(),
        email: Joi.string().min(4).required().email(),
        password: Joi.string().required(),
        // password: Joi.string()
        //     .min(6)
        //     .regex(
        //         /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[$@$!%*?&])[A-Za-z\d$@$!%*?&]+$/
        //     )
        //     .message(
        //         "Password must be atleast six characters long, must contain an uppercase and lowercase letter, a number and a special character"
        //     )
        //     .required(),
        phone: Joi.object({
            code: Joi.string(),
            number: Joi.number(),
        }).allow(null),
        address: Joi.object({
            country: Joi.string().required(),
            city: Joi.string().required(),
            zipcode: Joi.string().required(),
            state: Joi.string().allow(""),
        }).allow(null),
        avatar: Joi.string(),
        bio: Joi.string(),
        status: Joi.number().integer().min(0).max(1),
        isAdmin: Joi.number().integer().min(0).max(1),
        isHost: Joi.number().integer().min(0).max(1),
        bankName: Joi.string().allow(""),
        bankAccount: Joi.string().allow(""),
    });
    return schema.validate(data);
};

module.exports.hostsValidation = hostsValidation;
