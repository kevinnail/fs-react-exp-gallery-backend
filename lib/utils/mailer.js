async function sendNewPostEmail({ to, post }) {
  if (!process.env.MAIL_FROM) throw new Error('MAIL_FROM environment variable is required');
  const homePageUrl = process.env.FRONTEND_URL;
  const postUrl = `${process.env.FRONTEND_URL}/posts/${post.id}`;

  const templatePath = path.join(
    process.cwd(),
    'lib',
    'emailTemplates',
    'trackingEmailForPost.html',
  );
  let html = fs.readFileSync(templatePath, 'utf8');

  // manual replacements
  html = html.replace('{{title}}', post.title ?? '');
  html = html.replace('{{description}}', post.description ?? '');
  html = html.replace('{{imageUrl}}', post.image_url ?? '');
  html = html.replace('{{postUrl}}', postUrl);
  html = html.replace('{{homePageUrl}}', homePageUrl);
  html = html.replace('{{instagramUrl}}', 'https://www.instagram.com/stresslessglass');

  const subject = `New Gallery Post: ${post.title}`;

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    html,
  });

  // eslint-disable-next-line no-console
  console.log(`Gallery post notification email sent to: ${to}`);
}
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
  if (!process.env.MAIL_FROM) throw new Error('MAIL_FROM environment variable is required');
  // Must match the secret used when creating the token
  const { userId } = jwt.verify(verifyToken, process.env.EMAIL_VERIFY_SECRET);

  const verifyUrl = `${process.env.BACKEND_URL}/api/v1/users/verify?token=${verifyToken}`;

  const templatePath = path.join(process.cwd(), 'lib', 'emailTemplates', 'verifyEmail.html');
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

async function sendTrackingEmail(auctionOrPost, to, trackingNumber) {
  if (!auctionOrPost || !to || !trackingNumber) {
    throw new Error('sendTrackingEmail requires (auctionOrPost, to, trackingNumber)');
  }

  if (auctionOrPost !== 'auction' && auctionOrPost !== 'post') {
    throw new Error('sendTrackingEmail: auctionOrPost must be "auction" or "post"');
  }

  if (!process.env.MAIL_FROM) throw new Error('MAIL_FROM environment variable is required');

  //   URL's
  const trackingUrl = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(
    trackingNumber,
  )}`;
  const homePageUrl = `${process.env.FRONTEND_URL}`;
  const instagramUrl = 'https://www.instagram.com/stresslessglass';

  const templatePath = path.join(
    process.cwd(),
    'lib',
    'emailTemplates',
    auctionOrPost === 'auction' ? 'trackingEmailForAuction.html' : 'trackingEmailForPost.html',
  );
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
  if (!process.env.MAIL_FROM) throw new Error('MAIL_FROM environment variable is required');
  const homePageUrl = process.env.FRONTEND_URL;
  const auctionUrl = `${process.env.FRONTEND_URL}/auctions/${auction.id}`;

  const templatePath = path.join(process.cwd(), 'lib', 'emailTemplates', 'newAuctionEmail.html');
  let html = fs.readFileSync(templatePath, 'utf8');

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

  // eslint-disable-next-line no-console
  console.log(`Auction notification email sent to: ${to}`);
}

async function sendMessageEmail({ to, message }) {
  if (!process.env.MAIL_FROM) throw new Error('MAIL_FROM environment variable is required');
  const homePageUrl = process.env.FRONTEND_URL;

  const escapeHtml = (value) =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const rawContent = message?.messageContent ?? '';
  const maxPreviewChars = 200;
  const previewText =
    rawContent.length > maxPreviewChars
      ? `${rawContent.slice(0, maxPreviewChars).trimEnd()}…`
      : rawContent;
  const previewHtml = escapeHtml(previewText).replace(/\r\n|\r|\n/g, '<br />');
  const templateHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px;">
  <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">New message notification — please do not reply to this email.</span>
  <div style="background:#fff4f4;border:1px solid #f2b8b8;padding:12px 14px;border-radius:6px;margin-bottom:14px;">
    <strong style="color:#8a1f1f;">Do not reply to this email.</strong>
    <span style="color:#8a1f1f;">This mailbox isn’t monitored. To reply, open your inbox on the site.</span>
  </div>
  <h2>New Message from Stress Less Glass</h2>
  <p>You have a new message. Here’s a short preview:</p>
  <blockquote style="border-left: 4px solid #ccc; margin: 1em 0; padding: 0.5em 1em;">${previewHtml || 'Open your inbox to view the message.'}</blockquote>
  <p style="margin: 16px 0;">
    <a href="${homePageUrl}/messages" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 14px;border-radius:6px;">Login to your account</a>
  </p>
  <hr />
  <p style="font-size: 12px; color: #666">You’re receiving this because your account is set to receive email notifications.</p>
</div>
`;

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: 'You have a new message',
    html: templateHtml,
  });

  // eslint-disable-next-line no-console
  console.log(`Message notification email sent to: ${to}`);
}

module.exports = {
  sendVerificationEmail,
  sendTrackingEmail,
  sendNewAuctionEmail,
  sendMessageEmail,
  sendNewPostEmail,
};
