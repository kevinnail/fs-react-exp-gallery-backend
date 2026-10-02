/* eslint-disable no-console */
// Runs every email type against every combination of the four email preferences
// and prints who got what. Uses the test database (it is reset first) and a fake
// mail transport, so nothing is sent and dev data is never touched.

process.env.NODE_ENV = 'test';
// This checks customer preferences, so no customer should be treated as the admin
process.env.ADMIN_ID = 'none';
process.env.MAIL_FROM = process.env.MAIL_FROM || 'preference-check@example.com';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
process.env.UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET || 'preference-check-secret';
process.env.MAIL_POSTAL_ADDRESS = process.env.MAIL_POSTAL_ADDRESS || 'Preference check address';

// Must be replaced before the mailer module loads, since it builds its transport at require time
const nodemailer = require('nodemailer');
let capturedEmails = [];
nodemailer.createTransport = () => ({
  sendMail: async (mail) => {
    capturedEmails.push(mail);
  },
});

const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const User = require('../lib/models/User');
const Profile = require('../lib/models/Profile');
const { notifyUsersNewAuction } = require('../lib/services/auctionEmailService');
const { notifyUsersNewPost } = require('../lib/services/postEmailService');
const { sendMassEmailToCustomers } = require('../lib/services/adminEmailService');
const { sendMessageNotificationEmail } = require('../lib/services/notificationEmailService');

const PREFERENCES = ['emailAuctions', 'emailGalleryPosts', 'emailPromotions', 'emailMessages'];

const EMAIL_TYPES = [
  { name: 'Auction', expectedFor: (customer) => customer.preferences.emailAuctions },
  { name: 'Post', expectedFor: (customer) => customer.preferences.emailGalleryPosts },
  { name: 'Promotion', expectedFor: (customer) => customer.preferences.emailPromotions },
  { name: 'Announcement', expectedFor: () => true },
  { name: 'Message', expectedFor: (customer) => customer.preferences.emailMessages },
];

// All 16 on/off combinations of the four preferences
const allPreferenceCombinations = () =>
  Array.from({ length: 2 ** PREFERENCES.length }, (_unused, combinationNumber) =>
    Object.fromEntries(
      PREFERENCES.map((preference, bitPosition) => [
        preference,
        Boolean(combinationNumber & (1 << bitPosition)),
      ]),
    ),
  );

const createCustomers = async () => {
  const customers = [];
  for (const [index, preferences] of allPreferenceCombinations().entries()) {
    const user = await User.insert({
      email: `customer${index + 1}@example.com`,
      passwordHash: 'not-a-real-hash',
    });
    await Profile.insert({ userId: user.id, ...preferences });
    customers.push({ id: user.id, email: user.email, preferences });
  }
  return customers;
};

const recipientsOf = async (sendEmails) => {
  capturedEmails = [];
  await sendEmails();
  return new Set(capturedEmails.map((mail) => mail.to));
};

const runEmailTypes = async (customers) => {
  const auction = { id: 1, title: 'Check Auction', description: '', imageUrls: [''] };
  const post = { id: 1, title: 'Check Post', description: '', image_url: '' };
  const allCustomerIds = customers.map((customer) => Number(customer.id));

  return {
    Auction: await recipientsOf(() => notifyUsersNewAuction({ auction })),
    Post: await recipientsOf(() => notifyUsersNewPost({ post })),
    Promotion: await recipientsOf(() =>
      sendMassEmailToCustomers({ subject: 'Sale', message: 'Body', userIds: allCustomerIds }),
    ),
    Announcement: await recipientsOf(() =>
      sendMassEmailToCustomers({ subject: 'Site news', message: 'Body' }),
    ),
    Message: await recipientsOf(async () => {
      for (const customer of customers) {
        await sendMessageNotificationEmail({
          user: { id: customer.id, email: customer.email },
          message: { messageContent: 'Hello' },
        });
      }
    }),
  };
};

const onOff = (value) => (value ? 'on ' : 'off');

const printReport = (customers, recipientsByType) => {
  let failureCount = 0;
  const header = [
    'Customer'.padEnd(24),
    'Auc Post Promo Msg ',
    ...EMAIL_TYPES.map((emailType) => emailType.name.padEnd(13)),
  ].join(' | ');
  console.log(`\n${header}\n${'-'.repeat(header.length)}`);

  for (const customer of customers) {
    const preferenceColumn = PREFERENCES.map((preference) =>
      onOff(customer.preferences[preference]),
    ).join('  ');
    const resultColumns = EMAIL_TYPES.map((emailType) => {
      const expected = Boolean(emailType.expectedFor(customer));
      const received = recipientsByType[emailType.name].has(customer.email);
      if (expected !== received) failureCount += 1;
      const outcome = received ? 'sent' : 'not sent';
      return `${outcome}${expected === received ? '' : ' FAIL'}`.padEnd(13);
    });
    console.log([customer.email.padEnd(24), preferenceColumn, ...resultColumns].join(' | '));
  }

  console.log(
    failureCount === 0
      ? `\nPASS: all ${customers.length * EMAIL_TYPES.length} checks matched the preferences.`
      : `\nFAIL: ${failureCount} checks did not match the preferences (marked FAIL above).`,
  );
  return failureCount;
};

const main = async () => {
  await setup(pool);
  const customers = await createCustomers();
  const recipientsByType = await runEmailTypes(customers);
  const failureCount = printReport(customers, recipientsByType);
  await pool.end();
  process.exit(failureCount === 0 ? 0 : 1);
};

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
