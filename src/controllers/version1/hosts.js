const Host = require("../../models/hosts");
const Administrator = require("../../models/administrator");
const { hostsValidation } = require("../../validations/hosts");
const { sign } = require("jsonwebtoken");
const crypto = require("crypto");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const { hostLogin } = require("../../utilities/host_login_utility");
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
const { sendEmail } = require("../../utilities/quickbookingEmailer_utility");
const { getSettings } = require("../../utilities/settings_utility");

const moduleName = `Host`;

// Lets a host act on their OWN record (self-service profile editing) while
// still letting an Administrator act on any host's record. Anyone else must
// be rejected — otherwise one host's token can read/modify another host's
// PII and bank details.
const isRequesterSelfOrAdmin = async (req, targetId) => {
    if (req.user?.id && targetId && req.user.id === String(targetId)) {
        return true;
    }
    if (!req.user?.id) return false;
    const admin = await Administrator.findById(req.user.id);
    return !!admin;
};

const buildHostVerificationEmail = ({ name, verifyUrl }) => {
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
<div style="padding: 20px; max-width: 560px;">
    <h2 style="margin: 0 0 12px; color: #222;">Verify Your Email</h2>

    <p>Hi ${name}, thanks for registering as a host on QuickBooking. Please verify your email address before listing a property.</p>

    <p><a href="${verifyUrl}" style="color: #5eac12;">${verifyUrl}</a></p>

    <p>This link expires in 24 hours.</p>

    <p>If you have any questions, just reply to this email.</p>

    <p>Best regards,<br>
    QuickBooking Support Team</p>

    <a href="https://quickbooking.org" target="_blank">
    <img src="https://quickbooking.org/quickbooking-logo.png" alt="QuickBooking Logo" style="width: 150px; height: auto; margin-top: 20px;">
    </a>

    <p style="font-size: 12px; color: #aaa; margin-top: 12px;">&copy; ${new Date().getFullYear()} QuickBooking. All rights reserved.</p>
</div>
</body>
</html>`;

    const text = `Verify Your Email

Hi ${name}, thanks for registering as a host on QuickBooking. Please verify your email address before listing a property.

${verifyUrl}

This link expires in 24 hours.

Best regards,
QuickBooking Support Team

QuickBooking - ✓ Book ✓ Stay ✓ Experience.`;

    return { html, text };
};

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;
            const { error } = hostsValidation(body);

            if (error) return Response.sendValidationErrorMessage(res, 400, error);

            const existingHost = await Host.findOne({ email: body.email });
            if (existingHost) return Response.customResponse(res, 409, ResponseMessage.DATA_EXISTS);

            let codePrefix = "HO";

            // Generate unique code and hashed password
            const uniqueCode = unique.randomCode();
            const generatedCode = codePrefix + uniqueCode; // Code with appropriate prefix
            const hashedPassword = unique.passwordHash(body.password);

            // Prepare phone and address fields
            const phone = { ...body.phone };
            const address = { ...body.address };

            // When the super admin has switched verification off, new hosts are
            // created already-verified and no verification email is sent.
            const { hostEmailVerificationEnabled } = await getSettings();

            const verificationToken = crypto.randomBytes(32).toString("hex");
            const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

            const host = new Host({
                code: generatedCode,
                name: body.name,
                email: body.email,
                password: hashedPassword,
                avatar: body.avatar.replace(/\s+/g, ""),
                bio: body.bio,
                phone,
                address,
                status: 1,
                isEmailVerified: !hostEmailVerificationEnabled,
                emailVerificationToken: verificationToken,
                emailVerificationExpiry: verificationExpiry,
                isAdmin: body.isAdmin ? body.isAdmin : 0,
                isHost: body.isHost ? body.isHost : 0,
                rating: 0,
                createdOn: DateUtil.currentDate(),
                bankName: body.bankName ? body.bankName : " ",
                bankAccount: body.bankAccount ? body.bankAccount : " "
            });

            const newHost = await host.save();

            // Log the action
            const action = `New ${moduleName} - ${generatedCode}`;
            await createActivityLog(moduleName, action, generatedCode);
            //await accountOpening(req, res);

            if (hostEmailVerificationEnabled) {
                const verifyUrl = `${process.env.ADMIN_FRONTEND_URL || "https://admin.quickbooking.org"}/authentication/verify-email?token=${verificationToken}`;
                const { html, text } = buildHostVerificationEmail({ name: body.name, verifyUrl });
                sendEmail(body.email, "Verify your QuickBooking host account", html, res, {
                    text,
                    replyTo: process.env.SUPPORT_EMAIL,
                }).catch((err) => console.error("Host verification email failed:", err));
            }

            return Response.successResponse(res, 201, newHost);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message);
        }
    },

    resendVerificationEmail: async (req, res) => {
        try {
            const { email } = req.body;
            if (!email) return Response.customResponse(res, 400, "Email is required.");

            const host = await Host.findOne({ email });
            if (!host) return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            if (host.isEmailVerified) {
                return Response.customResponse(res, 400, "This email is already verified.");
            }

            host.emailVerificationToken = crypto.randomBytes(32).toString("hex");
            host.emailVerificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await host.save();

            const verifyUrl = `${process.env.ADMIN_FRONTEND_URL || "https://admin.quickbooking.org"}/authentication/verify-email?token=${host.emailVerificationToken}`;
            const { html, text } = buildHostVerificationEmail({ name: host.name, verifyUrl });
            const result = await sendEmail(host.email, "Verify your QuickBooking host account", html, res, {
                text,
                replyTo: process.env.SUPPORT_EMAIL,
            });

            if (result.status === "error") {
                return Response.errorResponse(res, 500, `Could not send verification email. Please try again later or contact ${process.env.SUPPORT_EMAIL}.`);
            }

            return Response.customResponse(res, 200, "Verification email sent. Please check your inbox.");
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    verifyEmail: async (req, res) => {
        try {
            const { token } = req.params;
            const host = await Host.findOne({
                emailVerificationToken: token,
                emailVerificationExpiry: { $gt: new Date() },
            });

            if (!host) return Response.customResponse(res, 400, "Invalid or expired verification link.");

            host.isEmailVerified = true;
            host.emailVerificationToken = undefined;
            host.emailVerificationExpiry = undefined;
            await host.save();

            return Response.customResponse(res, 200, "Email verified successfully.");
        } catch (err) {
            return Response.errorResponse(res, 500, err.message);
        }
    },

    getAll: async (req, res) => {
        try {
            const totalHosts = await Host.countDocuments();
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalHosts
            );

            if (totalHosts === 0) {
                return Response.customResponse(res, 200, res.statusCode, ResponseMessage.NO_DATA);
            }

            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
            }

            const hosts = await Host.find()
                .sort({ _id: -1 })
                .skip(skip)
                .select("-password")
                .limit(pagination.pageSize)

            if (hosts.length === 0) {
                return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            }

            pagination.data = hosts.map((item) => ({
                ...item.toJSON(),
            }));

            pagination.rows = totalHosts;


            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getById: async (req, res) => {
        try {
            if (!(await isRequesterSelfOrAdmin(req, req.params.id))) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const host = await Host.findById(req.params.id)
                .select("-password");

            if (!host) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            const hostData = {
                id: host._id,
                code: host.code,
                name: host.name,
                email: host.email,
                phone: host.phone,
                bio: host.bio,
                address: host.address,
                avatar: host.avatar.replace(/\s+/g, ""),
                status: host.status,
                isAdmin: host.isAdmin,
                isHost: host.isHost,
                isEmailVerified: host.isEmailVerified,
                bankName: host.bankName,
                bankAccount: host.bankAccount,
                createdOn: host.createdOn,
                updatedOn: host.updatedOn,
            };

            return Response.successResponse(res, res.statusCode, hostData);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // Public, guest-facing counterpart to getById above (self/admin only,
    // returns email/phone/address/bank details) — powers the guest site's
    // /host/:code profile page, so it deliberately selects only what's
    // already shown on a room's host card (never PII/financial fields).
    // Scoped to status only, NOT isHost — isHost tracks whether an account
    // has been through the "switch to hosting" UI flow, which turned out
    // not to reliably reflect whether they actually have live listings (a
    // real host with 7 approved rooms had isHost: 0). The room's own
    // hostId is the real source of truth for "does this account host
    // anything" — this endpoint is only ever reached via a code a guest
    // already saw on an actual room's host card, so status: 1 (not
    // deactivated) is the only gate that's actually meaningful here.
    getPublicByCode: async (req, res) => {
        try {
            const host = await Host.findOne({ code: req.params.code, status: 1 })
                .select("code name avatar bio rating createdOn");

            if (!host) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            return Response.successResponse(res, res.statusCode, {
                id: host.id,
                code: host.code,
                name: host.name,
                avatar: host.avatar,
                bio: host.bio,
                rating: host.rating,
                createdOn: host.createdOn,
            });
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    update: async (req, res) => {
        try {
            const body = req.body;

            if (!(await isRequesterSelfOrAdmin(req, body.id))) {
                return Response.customResponse(res, 403, ResponseMessage.ACCESS_DENIED);
            }

            const host = await Host.findById(body.id);

            if (!host) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            // Check if the email is being updated
            if (body.email && body.email !== host.email) {
                const existingEmail = await Host.findOne({
                    email: body.email,
                });

                if (existingEmail) {
                    return Response.customResponse(
                        res,
                        404,
                        ResponseMessage.EMAIL_EXISTS
                    );
                }
                host.email = body.email;
            }

            host.name = body.name || host.name;
            host.avatar = body.avatar.replace(/\s+/g, "") || host.avatar;
            host.address = body.address || host.address;
            host.phone = body.phone || host.phone;
            host.bio = body.bio || host.bio;
            host.bankName = body.bankName || host.bankName;
            host.bankAccount = body.bankAccount || host.bankAccount;
            host.status = body.status;
            host.updatedOn = DateUtil.currentDate();

            const updatedHost = await host.save();

            const action = `Updated ${moduleName} - ${host.code}`;

            await createActivityLog(moduleName, action, host.code);
            return res.status(res.statusCode).json(updatedHost);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    delete: async (req, res) => {
        try {
            const param = req.params;
            const userId = param.userId;

            const host = await Host.findById(param.id);

            if (!host) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            await host.deleteOne();

            const action = `Deleted ${moduleName} - ${host.code}`;
            await createActivityLog(moduleName, action, userId);

            return res.status(res.statusCode).json({
                message: ResponseMessage.SUCCESS_MESSAGE,
            });
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    login: async (req, res) => {
        await hostLogin(req, res, Host);
    },

    changePassword: async (req, res) => {
        await changePassword(req, res, Host, moduleName);
    },

    switchToHosting: async (req, res) => {
        try {
            const body = req.body;
            const host = await Host.findById(req.params.id);

            if (!host) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            if (!body.bankName || !body.bankAccount) {
                return Response.customResponse(res, 404, "Please submit your bank details");
            }

            host.isAdmin = 1;
            host.isHost = 1;
            host.bankName = body.bankName;
            host.bankAccount = body.bankAccount;
            host.updatedOn = DateUtil.currentDate();

            const updatedHost = await host.save();

            // generate new token
            const jsontoken = sign({ key: host }, process.env.JWK_SECRET, {
                expiresIn: process.env.JWK_EXPIRATION,
            });

            const action = `Updated ${moduleName} - ${host.code}`;

            await createActivityLog(moduleName, action, host.code);
            return res.status(res.statusCode).json({
                host: updatedHost,
                authorization: {
                    validFor: process.env.JWK_EXPIRATION,
                    validFrom: DateUtil.validFromDate(),
                    validUpto: DateUtil.expirationDate(),
                    token: jsontoken,
                },
            });
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    forgotPassword: async (req, res) => {
        await forgotPassword(req, res, Host, moduleName);
    },

    search: async (req, res) => {
        try {
            const body = req.body;
            // Build query
            const searchText = req.query.searchText || "";
            let query = {};

            if (searchText) {
                query.$or = [
                    { name: { $regex: searchText, $options: "i" } },
                    { code: { $regex: searchText, $options: "i" } },
                    { email: { $regex: searchText, $options: "i" } },
                ];
            }

            const totalHosts = await Host.countDocuments(query);

            if (totalHosts === 0) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            const { pagination, skip } = await PaginationUtility.paginationParams(req, totalHosts);

            if (pagination.page > pagination.pages || pagination.page < 1) {
                return Response.customResponse(res, 400, "Page is Out of Range");
            }

            // Get paginated Invoices
            const hosts = await Host.find(query)
                .sort({ _id: -1 })
                .skip(skip)
                .select("-password")
                .limit(pagination.pageSize);

            if (hosts.length === 0) {
                return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            }

            pagination.data = hosts.map((item) => ({
                ...item.toJSON(),
            }));

            pagination.rows = totalHosts;


            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            // console.error("Error:", err);
            return Response.errorResponse(res, 500, err.message || err);
        }
    },
}