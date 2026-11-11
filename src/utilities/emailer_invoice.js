// SEND EMAIL USING A SIMPLE SMTP FROM MAILTRAP

require('dotenv').config(); // Load environment variables from .env file.
const nodemailer = require('nodemailer');

const sendInvoiceEmail = async (to, subject, text, res) => {
  // console.error('Receiver Email:', to);

  try {
    if (!to) {
      throw new Error('Recipient email address is missing');
    }

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
    // console.log('Email sent:', info.response);
    return { status: 'success', message: 'Email sent successfully' };
  } catch (error) {
    // console.error('Error sending email:', error);
    // throw new Error('Failed to send email');
    return res.status(500).json({ error: error.message });
  }
};

module.exports = { sendInvoiceEmail };
