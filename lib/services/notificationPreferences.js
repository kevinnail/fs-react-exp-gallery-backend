const pool = require('../utils/pool');

/**
 * Reusable helpers for user email notification preferences.
 * Optionally extend to channel-based preferences in the future.
 */

async function isUserOptedIn(userId) {
  const { rows } = await pool.query(
    `
      SELECT send_email_notifications
      FROM profiles
      WHERE user_id = $1
    `,
    [userId],
  );
  if (!rows[0]) return false;
  return !!rows[0].send_email_notifications;
}

async function getOptedInUsers() {
  const { rows } = await pool.query(
    `
      SELECT profiles.user_id, users_admin.email, profiles.send_email_notifications,
             profiles.last_auction_email_at, profiles.last_message_email_at
      FROM profiles
      JOIN users_admin ON profiles.user_id = users_admin.id
      WHERE profiles.send_email_notifications = true
    `,
  );
  return rows;
}

module.exports = {
  isUserOptedIn,
  getOptedInUsers,
};
