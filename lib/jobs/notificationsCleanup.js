const cron = require('node-cron');
const db = require('../utils/pool.js');

async function cleanupOldNotifications() {
  try {
    const { rowCount } = await db.query(`
      DELETE FROM auction_notifications
      WHERE created_at < NOW() - INTERVAL '30 days'
    `);

    if (rowCount > 0) {
      console.log(
        `[Cron] Deleted ${rowCount} old auction notifications at ${new Date().toISOString()}`,
      );
    }
  } catch (err) {
    console.error('[Cron] Error cleaning up notifications:', err);
  }
}

// initialize and schedule the cleanup job
function initNotificationCleanup() {
  // Runs daily at 3:00 AM Pacific
  cron.schedule('0 3 * * *', cleanupOldNotifications, {
    timezone: 'America/Los_Angeles',
  });

  console.log('[Cron] Scheduled daily notification cleanup at 3:00 AM Pacific');
}

module.exports = {
  initNotificationCleanup,
  cleanupOldNotifications,
};
