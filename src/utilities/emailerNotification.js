// SEND EMAIL USING A SIMPLE SMTP FROM MAILTRAP

require('dotenv').config(); // Load environment variables from .env file.
const nodemailer = require('nodemailer');
const Response = require("./response_utility");
// const ResponseMessage = require("./messages_utility");

const sendEmailer = async (to, subject, text) => {
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
      from: {
        name: 'Oasis Reality',
        address: 'info@rentrack.org',
      },
      to,
      subject,
      html: text,
      replyTo: 'doNOTREPLY@rentrack.org',
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.response);
    return { status: 'success', message: 'Email sent successfully' };
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error(error.message); // Throw error instead of returning res
  }
};

module.exports = { sendEmailer };