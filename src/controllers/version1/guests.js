const { sign } = require("jsonwebtoken");
const { compareSync } = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const crypto = require("crypto");

const Guest = require("../../models/guests");
const { guestRegisterValidation, guestLoginValidation } = require("../../validations/guests");

const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const unique = require("../../utilities/codegenerator_utility");
const { sendEmail } = require("../../utilities/quickbookingEmailer_utility");
const { upsertGuestLead } = require("../../utilities/guestLead_utility");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const signToken = (guest) =>
    sign({ key: guest }, process.env.JWK_SECRET, { expiresIn: process.env.JWK_EXPIRATION });

const authPayload = (guest, token) => ({
    loginStatus: 1,
    id: guest.id,
    code: guest.code,
    firstName: guest.firstName,
    lastName: guest.lastName,
    email: guest.email,
    avatar: guest.avatar,
    phone: guest.phone || '',
    address: guest.address || null,
    googleId: guest.googleId || null,
    isEmailVerified: guest.isEmailVerified,
    authorization: {
        validFor: process.env.JWK_EXPIRATION,
        validFrom: DateUtil.validFromDate(),
        validUpto: DateUtil.expirationDate(),
        token,
    },
});

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;
            const { error } = guestRegisterValidation(body);
            if (error) return Response.sendValidationErrorMessage(res, 400, error);

            const existing = await Guest.findOne({ email: body.email });
            if (existing) return Response.customResponse(res, 409, ResponseMessage.DATA_EXISTS);

            const code = "GU" + unique.randomCode();
            const hashedPassword = unique.passwordHash(body.password);
            const verificationToken = crypto.randomBytes(32).toString("hex");
            const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

            const guest = new Guest({
                code,
                firstName: body.firstName,
                lastName: body.lastName,
                email: body.email,
                password: hashedPassword,
                phone: body.phone || "",
                avatar: body.avatar || "",
                isEmailVerified: false,
                emailVerificationToken: verificationToken,
                emailVerificationExpiry: verificationExpiry,
                createdOn: DateUtil.currentDate(),
            });

            await guest.save();

            upsertGuestLead({
                name: `${body.firstName} ${body.lastName}`.trim(),
                email: body.email,
                source: "signup",
                refId: guest._id,
                guestId: guest._id,
            }).catch((err) => console.error("[GuestLead] Unexpected error:", err));

            const verifyUrl = `${process.env.FRONTEND_URL || "https://quickbooking.org"}/auth/verify-email?token=${verificationToken}`;
            const emailSubject = "Verify your QuickBooking account";
            const emailText = `Hi ${body.firstName},<br><br>
Thank you for registering with QuickBooking. Please verify your email address by clicking the link below:<br><br>
<a href="${verifyUrl}" style="background:#0d6efd;color:#fff;padding:10px 20px;border-radius:5px;text-decoration:none;">Verify Email</a><br><br>
This link expires in 24 hours.<br><br>
Best Regards<br>QuickBooking Support<br><br>
<a href="https://quickbooking.org" target="_blank">
<img src="https://quickbooking.org/quickbooking-logo.png" alt="QuickBooking Logo" style="width:150px;height:auto;margin-top:20px;">
</a><br>
&copy; ${new Date().getFullYear()} All rights reserved.`;

            try {
                await sendEmail(body.email, emailSubject, emailText, res);
            } catch (emailErr) {
                // registration succeeded; email failure is non-fatal
            }

            return Response.customResponse(res, 201, "Registration successful. Please check your email to verify your account.");
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    login: async (req, res) => {
        try {
            const body = req.body;
            const { error } = guestLoginValidation(body);
            if (error) return Response.sendValidationErrorMessage(res, 400, error);

            const guest = await Guest.findOne({ email: body.email }).select("+password");
            if (!guest) return Response.customResponse(res, 400, ResponseMessage.INVALID_USERNAME);
            if (!guest.status) return Response.customResponse(res, 400, ResponseMessage.UNAUTHORIZED_USER);

            if (!guest.password) {
                return Response.customResponse(res, 400, "This account was created with Google. Please sign in with Google.");
            }

            const valid = compareSync(body.password, guest.password);
            if (!valid) return Response.customResponse(res, 400, ResponseMessage.INVALID_PASSWORD);

            if (!guest.isEmailVerified) {
                return Response.customResponse(res, 403, "Please verify your email address before signing in.");
            }

            const token = signToken(guest.toObject());
            return res.status(200).json(authPayload(guest, token));
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    googleAuth: async (req, res) => {
        try {
            const { idToken } = req.body;
            if (!idToken) return Response.customResponse(res, 400, "Google ID token is required.");

            const ticket = await googleClient.verifyIdToken({
                idToken,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            const payload = ticket.getPayload();
            const { sub: googleId, email, given_name: firstName, family_name: lastName, picture: avatar } = payload;

            let guest = await Guest.findOne({ $or: [{ googleId }, { email }] });

            if (!guest) {
                const code = "GU" + unique.randomCode();
                guest = new Guest({
                    code,
                    firstName: firstName || "",
                    lastName: lastName || "",
                    email,
                    googleId,
                    avatar: avatar || "",
                    isEmailVerified: true,
                    createdOn: DateUtil.currentDate(),
                });
                await guest.save();

                upsertGuestLead({
                    name: `${firstName || ""} ${lastName || ""}`.trim(),
                    email,
                    source: "signup",
                    refId: guest._id,
                    guestId: guest._id,
                }).catch((err) => console.error("[GuestLead] Unexpected error:", err));
            } else if (!guest.googleId) {
                guest.googleId = googleId;
                guest.isEmailVerified = true;
                if (!guest.avatar && avatar) guest.avatar = avatar;
                await guest.save();
            }

            if (!guest.status) return Response.customResponse(res, 400, ResponseMessage.UNAUTHORIZED_USER);

            const token = signToken(guest.toObject());
            return res.status(200).json(authPayload(guest, token));
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    verifyEmail: async (req, res) => {
        try {
            const { token } = req.params;
            const guest = await Guest.findOne({
                emailVerificationToken: token,
                emailVerificationExpiry: { $gt: new Date() },
            });

            if (!guest) return Response.customResponse(res, 400, "Invalid or expired verification link.");

            guest.isEmailVerified = true;
            guest.emailVerificationToken = undefined;
            guest.emailVerificationExpiry = undefined;
            await guest.save();

            return Response.customResponse(res, 200, "Email verified successfully. You can now sign in.");
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    updateProfile: async (req, res) => {
        try {
            const { id } = req.params;
            const { firstName, lastName, phone, avatar, address } = req.body;

            const guest = await Guest.findById(id);
            if (!guest) return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            if (firstName) guest.firstName = firstName;
            if (lastName) guest.lastName = lastName;
            if (phone !== undefined) guest.phone = phone;
            if (avatar !== undefined) guest.avatar = avatar;
            if (address && typeof address === 'object') {
                guest.address = {
                    country: address.country ?? guest.address?.country,
                    state: address.state ?? guest.address?.state,
                    town: address.town ?? guest.address?.town,
                    streetAddress: address.streetAddress ?? guest.address?.streetAddress,
                };
            }
            guest.updatedOn = new Date();

            await guest.save();

            const token = signToken(guest.toObject());
            return res.status(200).json(authPayload(guest, token));
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    changeEmail: async (req, res) => {
        try {
            const { id } = req.params;
            const { newEmail, password } = req.body;

            if (!newEmail) return Response.customResponse(res, 400, "New email is required.");

            const guest = await Guest.findById(id).select("+password");
            if (!guest) return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            if (newEmail === guest.email) return Response.customResponse(res, 400, "New email must be different from current email.");

            const taken = await Guest.findOne({ email: newEmail });
            if (taken) return Response.customResponse(res, 409, "This email address is already in use.");

            // Google-only accounts have no password; allow email change without password check
            if (guest.password) {
                if (!password) return Response.customResponse(res, 400, "Current password is required to change email.");
                const valid = compareSync(password, guest.password);
                if (!valid) return Response.customResponse(res, 400, "Incorrect password.");
            }

            const token = crypto.randomBytes(32).toString("hex");
            guest.pendingEmail = newEmail;
            guest.emailChangeToken = token;
            guest.emailChangeExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await guest.save();

            const confirmUrl = `${process.env.FRONTEND_URL || "https://quickbooking.org"}/auth/confirm-email-change?token=${token}`;
            const emailSubject = "Confirm your new email – QuickBooking";
            const emailText = `Hi ${guest.firstName},<br><br>
We received a request to update your QuickBooking email address to <strong>${newEmail}</strong>.<br><br>
Click the button below to confirm this change. The link expires in 24 hours.<br><br>
<a href="${confirmUrl}" style="background:#0d6efd;color:#fff;padding:10px 20px;border-radius:5px;text-decoration:none;">Confirm new email</a><br><br>
If you did not request this change, you can safely ignore this email.<br><br>
Best Regards<br>QuickBooking Support<br><br>
<a href="https://quickbooking.org" target="_blank">
<img src="https://quickbooking.org/quickbooking-logo.png" alt="QuickBooking Logo" style="width:150px;height:auto;margin-top:20px;">
</a><br>
&copy; ${new Date().getFullYear()} All rights reserved.`;

            try {
                await sendEmail(newEmail, emailSubject, emailText, res);
                return Response.customResponse(res, 200, "Verification email sent to your new address. Please confirm to complete the change.");
            } catch {
                return Response.customResponse(res, 500, "Email sending failed.");
            }
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    confirmEmailChange: async (req, res) => {
        try {
            const { token } = req.params;
            const guest = await Guest.findOne({
                emailChangeToken: token,
                emailChangeExpiry: { $gt: new Date() },
            });

            if (!guest) return Response.customResponse(res, 400, "Invalid or expired email change link.");

            guest.email = guest.pendingEmail;
            guest.pendingEmail = undefined;
            guest.emailChangeToken = undefined;
            guest.emailChangeExpiry = undefined;
            guest.updatedOn = new Date();
            await guest.save();

            return Response.customResponse(res, 200, "Email updated successfully. Please sign in with your new email address.");
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    changePassword: async (req, res) => {
        try {
            const { id } = req.params;
            const { currentPassword, newPassword } = req.body;

            if (!currentPassword || !newPassword) return Response.customResponse(res, 400, "Current password and new password are required.");
            if (newPassword.length < 6) return Response.customResponse(res, 400, "New password must be at least 6 characters.");

            const guest = await Guest.findById(id).select("+password");
            if (!guest) return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            if (!guest.password) return Response.customResponse(res, 400, "This account uses Google Sign-In and has no password set.");

            const valid = compareSync(currentPassword, guest.password);
            if (!valid) return Response.customResponse(res, 400, "Current password is incorrect.");

            guest.password = unique.passwordHash(newPassword);
            guest.updatedOn = new Date();
            await guest.save();

            return Response.customResponse(res, 200, "Password updated successfully.");
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    forgotPassword: async (req, res) => {
        try {
            const { email } = req.body;
            if (!email) return Response.customResponse(res, 400, "Email is required.");

            const guest = await Guest.findOne({ email });
            if (!guest) return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);

            if (guest.googleId && !guest.password) {
                return Response.customResponse(res, 400, "This account uses Google Sign-In. Please sign in with Google.");
            }

            const tempPassword = unique.passCode();
            guest.password = unique.passwordHash(tempPassword);
            await guest.save();

            const emailSubject = "Your QuickBooking Password Reset";
            const emailText = `Hi ${guest.firstName},<br><br>
Your password has been reset to <strong>${tempPassword}</strong>. Please sign in and change your password immediately.<br><br>
Best Regards<br>QuickBooking Support<br><br>
<a href="https://quickbooking.org" target="_blank">
<img src="https://quickbooking.org/quickbooking-logo.png" alt="QuickBooking Logo" style="width:150px;height:auto;margin-top:20px;">
</a><br>
&copy; ${new Date().getFullYear()} All rights reserved.`;

            try {
                await sendEmail(email, emailSubject, emailText, res);
                return Response.customResponse(res, 200, ResponseMessage.EMAIL_SUCCESS);
            } catch (emailErr) {
                return Response.customResponse(res, 500, "Email sending failed.");
            }
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },
};
