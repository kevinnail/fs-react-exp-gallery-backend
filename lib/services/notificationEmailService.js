const { isUserOptedIn } = require('./notificationPreferences');
const { sendMessageEmail } = require('../utils/mailer');
const Profile = require('../models/Profile');

const MESSAGE_EMAIL_WINDOW_MINUTES = 20; // 20 minute throttle window

function minutesSince(ts) {
  if (!ts) return Infinity;
  const diffMs = Date.now() - new Date(ts).getTime();
  return diffMs / 60000;
}

async function sendMessageNotificationEmail({ user, message }) {
  const optedIn = await isUserOptedIn(user.id);
  if (!optedIn) return { sent: false, reason: 'opted-out' };

  const profile = await Profile.getByUserId(user.id);
  const sinceLast = minutesSince(profile?.lastMessageEmailAt);
  if (sinceLast < MESSAGE_EMAIL_WINDOW_MINUTES) {
    return { sent: false, reason: 'throttled' };
  }

  await sendMessageEmail({ to: user.email, message });
  await Profile.updateLastMessageEmailTimestamp(user.id, new Date().toISOString());
  return { sent: true };
}

module.exports = {
  sendMessageNotificationEmail,
};
