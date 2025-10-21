// testEmail.js
require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: 465,
  secure: true,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

transporter.verify((err, success) => {
  if (err) {
    console.error('SMTP connection failed:', err);
  } else {
    console.log('SMTP connected and ready:', success);
  }
});

async function sendMail(to, subject, html) {
  const data = await transporter.sendMail({
    // from: '"Stress Less Glass" <no-reply@stresslessglass.kevinnail.com>',
    // from: '"Kevin Nail" <kevin@kevinnail.com>',
    from: process.env.MAIL_FROM,
    to,
    subject,
    html,
  });
  console.log('data', data);
}
const to = 'email@email.com';

const subject = 'Test message from Stress Less Glass';
const html = `
  <h2>Stress Less Glass Test</h2>
  <p>This is a delivery test from my website backend.</p>
  <p>If you receive this, reply so I know it’s reaching inboxes.</p>
`;

(async () => {
  try {
    await sendMail(to, subject, html);
    console.log('Mail sent successfully');
  } catch (err) {
    console.error('Error sending mail:', err);
  }
})();
