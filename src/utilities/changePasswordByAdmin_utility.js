const bcrypt = require("bcryptjs");

const Response = require("./response_utility");
const ResponseMessage = require("./messages_utility");
const unique = require("./codegenerator_utility");
const { createActivityLog } = require("./activitylog_utility");
const { changePasswordByAdminValidation } = require("../validations/changePasswordByAdmin");
const { changePasswordEmail } = require("./emailerChangePassword_utility");

const changePasswordByAdmin = async (req, res, model, moduleName) => {
    try {
        const body = req.body;
        const { error } = changePasswordByAdminValidation(body);
        if (error) {
            return Response.errorResponse(res, 400, error);
        }

        const user = await model.findById(body.userId);

        if (!user) {
            return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
        }

        const hashedPassword = unique.passwordHash(body.newPassword);
        user.password = hashedPassword;

        await user.save();

        const action = `Changed Password - ${user.code}`;
        await createActivityLog(moduleName, action, user.code);
        //await changePasswordEmail(user.email, user.name, body.newPassword, res);

        return Response.customResponse(
            res,
            res.statusCode,
            ResponseMessage.SUCCESS_MESSAGE
        );
    } catch (err) {
        return Response.errorResponse(res, 500, err);
    }
};

module.exports = { changePasswordByAdmin };
