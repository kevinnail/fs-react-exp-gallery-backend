const cron = require('node-cron');
const MetricSnapshot = require('../models/MetricSnapshot.js');
const ErrorLog = require('../models/ErrorLog.js');

const captureMetricSnapshot = async () => {
  try {
    await MetricSnapshot.captureToday();
  } catch (err) {
    console.error('[Cron] Error capturing metric snapshot:', err);
    await ErrorLog.log(err.message, 'captureMetricSnapshot');
  }
};

// Hourly rather than once at midnight: a sleeping or restarting dyno would
// otherwise skip the day. Each capture overwrites the day's row.
const initMetricSnapshots = async () => {
  cron.schedule('0 * * * *', captureMetricSnapshot, {
    timezone: 'America/Los_Angeles',
  });

  // eslint-disable-next-line no-console
  console.log('[Cron] Scheduled hourly metric snapshot');

  await captureMetricSnapshot();
};

module.exports = {
  initMetricSnapshots,
  captureMetricSnapshot,
};
