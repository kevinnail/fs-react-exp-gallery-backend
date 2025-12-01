const Profile = require('../models/Profile');
const { sendNewAuctionEmail } = require('../utils/mailer.js');

const COOLDOWN_MINUTES = 120;

async function notifyUsersNewAuction({ auction }) {
  const users = await Profile.getUsersWithEmailNotifications();
  const now = new Date();

  for (const user of users) {
    try {
      const last = user.last_auction_email_at;
      const shouldSend = !last || (now - new Date(last)) / 60000 > COOLDOWN_MINUTES;
      if (!shouldSend) continue;

      await sendNewAuctionEmail({ to: user.email, auction });

      await Profile.updateLastAuctionEmailTimestamp(user.user_id, now);
    } catch (err) {
      console.error('notifyUsersNewAuction error for', user.user_id, err);
    }
  }
}

module.exports = { notifyUsersNewAuction };
