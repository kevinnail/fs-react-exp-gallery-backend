// /jobs/auctionTimers.js
const cron = require('node-cron');
const db = require('../utils/pool.js');

// in-memory registry of timers by auctionId
const timers = new Map();

// finalize a single auction by id - idempotent
async function completeAuction(auctionId) {
  try {
    const { rowCount } = await db.query(
      `
      UPDATE auctions
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1 AND is_active = TRUE AND end_time <= NOW()
      `,
      [auctionId],
    );

    if (rowCount > 0) {
      global.wsService.getIO().emit('auction-ended', { auctionId });
      console.log(`[Cron] Ended auction ${auctionId} at ${new Date().toISOString()}`);
    }
  } catch (err) {
    console.error(`[Cron] Error completing auction ${auctionId}`, err);
  }
}

// batch sweep - catches anything missed
async function sweepExpiredAuctions() {
  try {
    const { rows } = await db.query(
      `
      UPDATE auctions
      SET is_active = FALSE, updated_at = NOW()
      WHERE is_active = TRUE AND end_time <= NOW()
      RETURNING id
      `,
    );
    if (rows.length) {
      // rows.forEach(({ id }) => io.emit('auction-ended', { auctionId: id }));
      rows.forEach(({ id }) => {
        global.wsService.getIO().emit('auction-ended', { auctionId: id });
      });

      console.log(`[Cron] Sweep ended ${rows.length} auctions at ${new Date().toISOString()}`);
    }
  } catch (err) {
    console.error('[Cron] Sweep error', err);
  }
}

// schedule precise one-time end using setTimeout
function scheduleAuctionEnd(auctionId, endTime) {
  const endDate = new Date(endTime);
  const now = new Date();
  const delay = endDate - now;

  // clear existing timer for this auction if any
  cancelAuctionEnd(auctionId);

  if (delay <= 0) {
    // already expired - let the sweep pick it up soon or call completeAuction now
    return;
  }

  const t = setTimeout(async () => {
    console.log(`[Cron] Timer firing for auction ${auctionId} at ${new Date().toISOString()}`);
    timers.delete(auctionId);
    await completeAuction(auctionId);
  }, delay);

  timers.set(auctionId, t);
  console.log(
    `[Cron] Scheduled one-time end for auction ${auctionId} in ${Math.round(delay / 1000)} seconds`,
  );
}
// cancel a previously scheduled end for an auction
function cancelAuctionEnd(auctionId) {
  const t = timers.get(auctionId);
  if (t) {
    clearTimeout(t);
    timers.delete(auctionId);
    console.log(`[Cron] Cancelled timer for auction ${auctionId}`);
  }
}
// initialize on server start - schedule all active auctions
async function initAuctionTimers() {
  // safety sweep at 5:00-5:05 PM Pacific daily
  cron.schedule('0-5 17 * * *', sweepExpiredAuctions, {
    timezone: 'America/Los_Angeles',
  });

  try {
    const { rows } = await db.query(`
      SELECT id, end_time
      FROM auctions
      WHERE is_active = TRUE
    `);
    rows.forEach((a) => scheduleAuctionEnd(a.id, a.end_time));
    console.log(`[Cron] Scheduled ${rows.length} one-time timers on startup`);
  } catch (err) {
    console.error('[Cron] Failed to schedule timers on startup', err);
  }
}

module.exports = {
  initAuctionTimers,
  scheduleAuctionEnd,
  cancelAuctionEnd,
  sweepExpiredAuctions,
  completeAuction,
};
