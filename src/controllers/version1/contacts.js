// VALIDATIONS
const { contactUsValidation } = require("../../validations/contacts");

// UTILITIES
const Response = require("../../utilities/response_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");
const { sendEmail } = require("../../utilities/emailer_Contact");
const EmailLog = require("../../models/EmailLog");

const moduleName = `Contact Us`;

module.exports = {
  send: async (req, res) => {
    try {
      const body = req.body;

      const { error } = contactUsValidation(body);
      if (error) {
        return Response.sendValidationErrorMessage(res, 400, error);
      }

      const senderName = body.fullName;
      const senderEmail = body.email;
      const senderPhone = body.phoneNumber;

      const emailSubject = `🎉 General Inquiry - ${body.subject}`;
      const emailText = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <p>Hello,</p>

            <p>You have received a message from <strong>${senderName} : ${senderPhone}</strong>.</p>

            <h3 style="color: #444; margin-top: 25px;">💬 Client's Message</h3>
            <blockquote style="background-color: #f9f9f9; border-left: 4px solid #ccc; padding: 10px 15px; margin: 20px 0;">
                ${body.message || "No additional comments were provided."}
            </blockquote>

            <p>I look forward to hearing from you.</p>

            <br>
            <p style="font-weight: bold;">Best Regards,<br>${senderName}</p>

            <br>
            <div style="border-top: 1px solid #ddd; padding-top: 15px;">
                <a href="https://rentrack.org" target="_blank">
                    <img src="https://quickbooking.org/quickbooking-logo-wide.png" alt="QuickBooking Logo" style="width: 150px; height: auto;">
                </a><br>
                <span style="font-size: 12px; color: #999;">&copy; ${new Date().getFullYear()} Rentrack. All rights reserved.</span>
            </div>
        </div>
      `;

      const emailResponse = await sendEmail(senderEmail, emailSubject, emailText);

      if (emailResponse.status === 'error') {
        await EmailLog.create({
          to: 'info@rentrack.org',
          subject: emailSubject,
          message: emailText,
          status: "failed",
          error: emailResponse.message,
          createdOn: DateUtil.currentDate()
        });
        return Response.customResponse(res, 500, emailResponse.message);
      }

      const action = `New ${moduleName} - ${body.subject}`;
      await createActivityLog(moduleName, action, senderName);

      return res.status(200).json({ message: "Email sent successfully" });

    } catch (err) {
      return Response.errorResponse(res, 500, err.message);
    }
  }

};
