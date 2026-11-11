require('dotenv').config();
const nodemailer = require('nodemailer');

const isProduction = process.env.NODE_ENV === 'production';

const sendEmail = async (to, subject, text, res, options = {}) => {
    try {
        const transporter = nodemailer.createTransport(
            isProduction
                ? {
                      host: 'live.smtp.mailtrap.io',
                      port: 587,
                      secure: false,
                      auth: {
                          user: process.env.MAILTRAP_USER,
                          pass: process.env.MAILTRAP_PASS,
                      },
                  }
                : {
                      host: 'smtp.gmail.com',
                      port: 587,
                      secure: false,
                      auth: {
                          user: process.env.GMAIL_USER,
                          pass: process.env.GMAIL_APP_PASS,
                      },
                  }
        );

        const fromAddress = isProduction ? 'info@rentrack.org' : process.env.GMAIL_USER;

        const mailOptions = {
            from: { name: 'QuickBooking', address: fromAddress },
            to,
            subject,
            html: text,
            replyTo: options.replyTo || 'doNOTREPLY@rentrack.org',
        };

        if (options.text) {
            mailOptions.text = options.text;
        }

        // Step 3: Send email
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent:', info.response);
        return { status: 'success', message: 'Email sent successfully' };
        // return Response.customResponse(res, res.statusCode, ResponseMessage.EMAIL_SUCCESS);
    } catch (error) {
        console.error('Error sending email:', error);
        return { status: 'error', message: error.message };
    }
};

module.exports = { sendEmail };
