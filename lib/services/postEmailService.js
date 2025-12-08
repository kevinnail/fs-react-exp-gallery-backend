const Profile = require('../models/Profile');
const { sendNewPostEmail } = require('../utils/mailer.js');

const COOLDOWN_MINUTES = 120;

async function notifyUsersNewPost({ post }) {
  const users = await Profile.getUsersWithEmailNotifications();
  const now = new Date();

  for (const user of users) {
    try {
      const last = user.last_post_email_at;
      const shouldSend = !last || (now - new Date(last)) / 60000 > COOLDOWN_MINUTES;
      if (!shouldSend) continue;

      await sendNewPostEmail({ to: user.email, post });

      await Profile.updateLastPostEmailTimestamp(user.user_id, now);
    } catch (err) {
      console.error('notifyUsersNewPost error for user:', user.user_id, 'email:', user.email, err);
    }
  }
}

module.exports = { notifyUsersNewPost };
