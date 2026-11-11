const { sendEmail } = require("./emailer");
const Response = require("./response_utility");
const ResponseMessage = require("./messages_utility");

const changePasswordEmail = async (email, name, password, res) => {
  try {

    const emailSubject = "Password Change Confirmation";
    const emailText = `Dear ${name}, <br><br>
    This is to confirm that the password for your account has been successfully changed. Your account is now secured with the new password that you have set.<br><br>
    If you did not change your password, please contact us immediately to report any unauthorized access to your account.<br><br>
    If you have any issues or concerns regarding your account, please do not hesitate to contact our customer support team for further assistance.<br><br>
    Thank you for using our service.<br><br>
    <a href="https://admin.rentrack.org" target="_blank" style="display: inline-block; padding: 10px 20px; background-color: #007BFF; color: white; text-decoration: none; border-radius: 5px;">Go to my Account</a>
    <br><br>

    Username: ${email}<br>
    New Password: ${password}

    <br><br>
    
    Best Regards <br> Rentrack Support<br><br>
    <a href="https://rentrack.org" target="_blank">
    <img src="https://quickbooking.org/quickbooking-logo-wide.png" alt="QuickBooking Logo" style="width: 150px; height: auto;">
    </a><br>
    &copy; ${new Date().getFullYear()} All rights reserved.`;

    try {
      await sendEmail(email, emailSubject, emailText, res);
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

module.exports = { changePasswordEmail };
