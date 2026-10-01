const Profile = require('../models/Profile');
const User = require('../models/User');
const { sendMassEmail } = require('../utils/mailer.js');

// userIds ? Promotion : Announcement
const getRecipients = async (userIds) => {
  if (!userIds) {
    const users = await User.getAll();
    return users.map((user) => ({ userId: user.id, email: user.email }));
  }

  const targetedUserIds = new Set(userIds);
  const optedInUsers = await Profile.getUsersWithEmailNotifications();
  return optedInUsers
    .filter((user) => targetedUserIds.has(Number(user.user_id)))
    .map((user) => ({ userId: user.user_id, email: user.email }));
};

const sendMassEmailToCustomers = async ({ subject, message, userIds }) => {
  const recipients = await getRecipients(userIds);
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    try {
      await sendMassEmail({ to: recipient.email, subject, message });
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error(
        'sendMassEmailToCustomers error for user:',
        recipient.userId,
        'email:',
        recipient.email,
        err,
      );
    }
  }

  return { total: recipients.length, sent, failed };
};

module.exports = { sendMassEmailToCustomers };
