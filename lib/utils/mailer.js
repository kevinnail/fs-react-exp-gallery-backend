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
    from: process.env.MAIL_FROM,
    to,
    subject: 'Verify your email address',
    html,
  });

  // eslint-disable-next-line no-console
  console.log(`Verification email sent to: ${to} for userId: ${userId}`);
}

async function sendTrackingEmail(to, trackingNumber) {
  //   URL's
  const trackingUrl = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(
    trackingNumber,
  )}`;
  const homePageUrl = `${process.env.FRONTEND_URL}`;
  const instagramUrl = 'https://www.instagram.com/stresslessglass';

  const templatePath = path.join(process.cwd(), 'lib', 'templates', 'trackingEmail.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  html = html.replace('{{trackingUrl}}', trackingUrl);
  html = html.replace('{{trackingNumber}}', trackingNumber);
  html = html.replace('{{homePageUrl}}', homePageUrl);
  html = html.replace('{{instagramUrl}}', instagramUrl);

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: 'Your package has shipped!',
    html,
  });

  // eslint-disable-next-line no-console
  console.log(`Tracking info email sent to: ${to}`);
}

async function sendNewAuctionEmail({ to, auction }) {
  const homePageUrl = process.env.FRONTEND_URL;
  const auctionUrl = `${process.env.FRONTEND_URL}/auctions/${auction.id}`;

  const templatePath = path.join(process.cwd(), 'lib', 'templates', 'newAuctionEmail.html');
  let html = fs.readFileSync(templatePath, 'utf8');
  console.log('auction', auction);

  // manual replacements
  html = html.replace('{{title}}', auction.title ?? '');
  html = html.replace('{{description}}', auction.description ?? '');
  html = html.replace('{{imageUrl}}', auction.imageUrls[0] ?? '');
  html = html.replace('{{auctionUrl}}', auctionUrl);
  html = html.replace('{{homePageUrl}}', homePageUrl);
  html = html.replace('{{instagramUrl}}', 'https://www.instagram.com/stresslessglass');

  const subject = `New Auction Posted: ${auction.title}`;

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    html,
  });

  console.log(`Auction notification email sent to: ${to}`);
}

module.exports = { sendVerificationEmail, sendTrackingEmail, sendNewAuctionEmail };
