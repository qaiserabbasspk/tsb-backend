const { sendEmail } = require("./emailer");
const Response = require("./response_utility");
const ResponseMessage = require("./messages_utility");

// const accountOpening = async (req, res, model, moduleName) => {
// const accountOpening = async (req, res, model, name, email, password) => {
  const accountOpening = async (req, res) => {
  try {
    const body = req.body;
    // const user = await model.findOne({ email: body.email });

    // if (!user) {
    //   return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
    // }

    const emailSubject = "Account Opening";
    const emailText = `Dear ${body.name}, <br><br>
              Thank you for expressing your interest in <strong>Rentrack Properties</strong>. Please click the button below to complete your application process inorder to activate your account.<br><br>
              <a href="https://admin.data.org" target="_blank" style="display: inline-block; padding: 10px 20px; background-color: #007BFF; color: white; text-decoration: none; border-radius: 5px;">Activate Account</a>
              <br><br>
              Username: ${body.email}<br>
              Password: ${body.password}
              <br><br>
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

module.exports = { accountOpening };
