const Joi = require("joi");

const administratorValidation = (data) => {
    const schema = Joi.object({
        name: Joi.string().required(),
        email: Joi.string().min(4).required().email(),
        password: Joi.string()
            .min(6)
            .regex(
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[$@$!%*?&])[A-Za-z\d$@$!%*?&]+$/
            )
            .message(
                "Password must be atleast six characters long, must contain an uppercase and lowercase letter, a number and a special character"
            )
            .required(),
        avatar: Joi.string(),
        status: Joi.number().integer().min(0).max(1),
        isAdmin: Joi.number().integer().min(0).max(1),
    });
    return schema.validate(data);
};

module.exports.administratorValidation = administratorValidation;
