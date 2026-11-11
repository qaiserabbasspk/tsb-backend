// SEND EMAIL USING A SIMPLE SMTP FROM MAILTRAP

require('dotenv').config();
const nodemailer = require('nodemailer');
const Response = require("./response_utility");
// const ResponseMessage = require("./messages_utility");

const sendEmail = async (fromEmail, subject, htmlContent) => {
  try {
    const transporter = nodemailer.createTransport({
      host: 'live.smtp.mailtrap.io',
      port: 587,
      secure: false,
      auth: {
        user: process.env.MAILTRAP_USER,
        pass: process.env.MAILTRAP_PASS,
      },
    });

    const mailOptions = {
      from: '"Rentrack Contact" <no-reply@rentrack.org>',  // fixed authenticated domain
      to: 'info@rentrack.org',                              // destination
      subject,
      html: htmlContent,
      replyTo: fromEmail                                    // user's real email here
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.response);
    return { status: 'success', message: 'Email sent successfully' };
  } catch (error) {
    console.error('Error sending email:', error);
    return { status: 'error', message: error.message };
  }
};

module.exports = { sendEmail };
