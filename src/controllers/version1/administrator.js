const Administrator = require("../../models/administrator");
const { administratorValidation } = require("../../validations/administrator");
const { sign } = require("jsonwebtoken");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const { adminLogin } = require("../../utilities/admin_utility");
const Response = require("../../utilities/response_utility");
const unique = require("../../utilities/codegenerator_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { changePassword } = require("../../utilities/changepassword_utility");
const { createActivityLog } = require("../../utilities/qbActivityLog_utility");
const { forgotPassword } = require("../../utilities/forgotpassword_utility");
const { accountOpening } = require("../../utilities/accountOpening_utility");
// const { findRole } = require("../../utilities/role_finder_utility");
const { createAccount } = require("../../utilities/accounts_utility");

const moduleName = `Host`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;
            const { error } = administratorValidation(body);

            if (error) return Response.sendValidationErrorMessage(res, 400, error);

            const existingAdmin = await Administrator.findOne({ email: body.email });
            if (existingAdmin) return Response.customResponse(res, 409, ResponseMessage.DATA_EXISTS);

            let codePrefix = "AD";

            // Generate unique code and hashed password
            const uniqueCode = unique.randomCode();
            const generatedCode = codePrefix + uniqueCode; // Code with appropriate prefix
            const hashedPassword = unique.passwordHash(body.password);

            // Prepare phone and address fields
            // const phone = { ...body.phone };
            // const address = { ...body.address };

            const admin = new Administrator({
                code: generatedCode,
                name: body.name,
                email: body.email,
                password: hashedPassword,
                avatar: body.avatar.replace(/\s+/g, ""),
                status: 1,
                isAdmin: 0,
                createdOn: DateUtil.currentDate(),
            });

            const newAdmin = await admin.save();

            // Log the action
            const action = `New ${moduleName} - ${generatedCode}`;
            await createActivityLog(moduleName, action, generatedCode);
            //await accountOpening(req, res);

            return Response.successResponse(res, 201, newAdmin);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message);
        }
    },

    login: async (req, res) => {
        await adminLogin(req, res, Administrator);
    },

    getAll: async (req, res) => {
        try {
            const totalAdmins = await Administrator.countDocuments();
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalAdmins
            );

            if (totalAdmins === 0) {
                return Response.customResponse(res, 200, res.statusCode, ResponseMessage.NO_DATA);
            }

            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
            }

            const admins = await Administrator.find()
                .sort({ _id: -1 })
                .skip(skip)
                .select("-password")
                .limit(pagination.pageSize)

            if (admins.length === 0) {
                return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            }

            pagination.data = admins.map((item) => ({
                ...item.toJSON(),
            }));

            pagination.rows = totalAdmins;


            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    update: async (req, res) => {
        try {
            const body = req.body;
            const user = await Administrator.findById(body.id);

            if (!user) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            // Check if the email is being updated
            if (body.email && body.email !== user.email) {
                const existingEmail = await Administrator.findOne({
                    email: body.email,
                });

                if (existingEmail) {
                    return Response.customResponse(
                        res,
                        404,
                        ResponseMessage.EMAIL_EXISTS
                    );
                }
                user.email = body.email;
            }

            user.name = body.name || user.name;
            user.avatar = body.avatar.replace(/\s+/g, "") || user.avatar;
            user.status = body.status;
            user.email = body.email || user.email;
            user.updatedOn = DateUtil.currentDate();

            const updatedUser = await user.save();

            const action = `Updated ${moduleName} - ${user.code}`;
            const person = user.code;

            await createActivityLog(moduleName, action, person);

            return res.status(res.statusCode).json(updatedUser);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    delete: async (req, res) => {
        try {
            const param = req.params;
            const userId = param.userId;

            const user = await Administrator.findById(param.id);

            if (!user) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            await user.deleteOne();

            const action = `Deleted ${moduleName} - ${user.code}`;
            await createActivityLog(moduleName, action, userId);

            return res.status(res.statusCode).json({
                message: ResponseMessage.SUCCESS_MESSAGE,
            });
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    changePassword: async (req, res) => {
        await changePassword(req, res, Administrator, moduleName);
    },

    resetPassword: async (req, res) => {
        await forgotPassword(req, res, Administrator, moduleName);
    },

}