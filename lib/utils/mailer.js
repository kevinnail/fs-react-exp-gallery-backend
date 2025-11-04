const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

async function sendVerificationEmail(to, verifyToken) {
  // Must match the secret used when creating the token
  const { userId } = jwt.verify(verifyToken, process.env.EMAIL_VERIFY_SECRET);

  const verifyUrl = `${process.env.BACKEND_URL}/api/v1/users/verify?token=${verifyToken}`;

  const templatePath = path.join(process.cwd(), 'lib', 'templates', 'verifyEmail.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  // You can leave name out since it’s not in your token
  html = html.replace('{{verifyUrl}}', verifyUrl);

  await transporter.sendMail({
    from: '"Stress Less Glass" <no-reply@kevinnail.com>',
    to,
    subject: 'Verify your email address',
    html,
  });

  // eslint-disable-next-line no-console
  console.log(`Verification email sent to: ${to} for userId: ${userId}`);
}

module.exports = { sendVerificationEmail };
