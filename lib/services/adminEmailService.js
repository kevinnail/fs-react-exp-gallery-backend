const Profile = require('../models/Profile');
const { sendMassEmail } = require('../utils/mailer.js');

// Admin broadcast to every customer who has email notifications enabled.
// Unlike the event-driven notifications there is no cooldown — the admin
// explicitly chooses to send this, and one email goes to each recipient
// individually so addresses are never exposed to other customers.
async function sendMassEmailToCustomers({ subject, message }) {
  const users = await Profile.getUsersWithEmailNotifications();
  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await sendMassEmail({ to: user.email, subject, message });
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error(
        'sendMassEmailToCustomers error for user:',
        user.user_id,
        'email:',
        user.email,
        err,
      );
    }
  }

  return { total: users.length, sent, failed };
}

module.exports = { sendMassEmailToCustomers };
