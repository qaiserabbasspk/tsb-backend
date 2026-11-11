const { sendEmail } = require("../utilities/emailer");
const Response = require("../utilities/response_utility");
const ResponseMessage = require("./messages_utility");
const unique = require("../utilities/codegenerator_utility");
const { createActivityLog } = require("../utilities/activitylog_utility");

const resetPassword = async (req, res, model, moduleName) => {
  try {
    const body = req.body;
    const user = await model.findOne({ email: body.email });

    if (!user) {
      return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
    }

    const resetPassword = unique.passCode();
    const hashedPassword = unique.passwordHash(resetPassword);

    user.password = hashedPassword;
    await user.save();

    const action = `Reset Password - ${user.code}`;
    const userId = `${user.code}`;
    await createActivityLog(moduleName, action, userId);

    const emailSubject = "Reset Password";
    const emailText = `Hi ${user.name}, <br><br>
    Your password has been reset to <strong>${resetPassword}</strong>. Kindly ensure you change your password after sign in.<br><br>
    Best Regards <br> Rentrack Support<br><br>
    <a href="https://rentrack.org" target="_blank">
    <img src="https://quickbooking.org/quickbooking-logo-wide.png" alt="QuickBooking Logo" style="width: 150px; height: auto;">
    </a><br>
    &copy; ${new Date().getFullYear()} All rights reserved.`;

    try {
      await sendEmail(body.email, emailSubject, emailText, res);
      return Response.customResponse(res, res.statusCode, ResponseMessage.EMAIL_SUCCESS);
    } catch (error) {
      console.error("Email Error2: ", error);
      return Response.customResponse(res, 500, "Email sending failed");
    }
  } catch (error) {
    console.error("Reset Password Error3: ", error);
    return Response.customResponse(res, 500, error.message);
  }
};

module.exports = { resetPassword };
