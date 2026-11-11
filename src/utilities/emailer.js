// SEND EMAIL USING A SIMPLE SMTP FROM MAILTRAP

require('dotenv').config();
const nodemailer = require('nodemailer');
const Response = require("../utilities/response_utility");
// const ResponseMessage = require("./messages_utility");

const sendEmail = async (to, subject, text, res) => {
  try {
    // Step 1: Configure Nodemailer Transporter with Mailtrap credentials
    const transporter = nodemailer.createTransport({
      host: 'live.smtp.mailtrap.io', // Mailtrap SMTP server
      // host: 'sandbox.smtp.mailtrap.io', // Mailtrap SMTP server
      port: 587,
      secure: false, // Use STARTTLS
      auth: {
        user: process.env.MAILTRAP_USER, // Your Mailtrap username
        pass: process.env.MAILTRAP_PASS, // Your Mailtrap password (replace with env variable)
      },
    });

    // Step 2: Define mail options
    const mailOptions = {
      from: {
        name: 'Oasis Reality',
        address: 'info@rentrack.org', // Use your Mailtrap-verified sender address
      },
      to,
      subject,
      html: text,
      replyTo: 'doNOTREPLY@rentrack.org', // Optional for handling replies
    };

    // Step 3: Send email
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.response);
    return { status: 'success', message: 'Email sent successfully' };
    // return Response.customResponse(res, res.statusCode, ResponseMessage.EMAIL_SUCCESS);
  } catch (error) {
    console.error('Error sending email:', error);
    // throw new Error('Failed to send email');
    return Response.customResponse(res, 500, error.message);
  }
};

module.exports = { sendEmail };
