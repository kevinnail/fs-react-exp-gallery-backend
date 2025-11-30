// /jobs/auctionTimers.js
const cron = require('node-cron');
const db = require('../utils/pool.js');
const Message = require('../models/Message.js');
// in-memory registry of timers by auctionId
const timers = new Map();

// finalize a single auction by id - idempotent
async function completeAuction(auctionId) {
  const client = await db.connect(); // get a dedicated client for transaction control
  try {
    await client.query('BEGIN'); // start transaction

    // 1. Mark auction inactive
    const { rowCount } = await client.query(
      `
      UPDATE auctions
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1 AND is_active = TRUE AND end_time <= NOW()
      `,
      [auctionId],
    );

    if (rowCount > 0) {
      // 2. Get top bid
      const { rows: bidRows } = await client.query(
        `
        SELECT user_id, bid_amount
        FROM bids
        WHERE auction_id = $1
        ORDER BY bid_amount DESC, created_at ASC
        LIMIT 1
        `,
        [auctionId],
      );

      // 3. If a winner exists, record result and emit
      if (bidRows.length > 0) {
        const winnerId = bidRows[0].user_id;
        const finalBid = bidRows[0].bid_amount;

        // record result for a naturally expired auction
        await client.query(
          `
          INSERT INTO auction_results (auction_id, winner_id, final_bid, closed_reason)
          VALUES ($1, $2, $3, 'expired')
          `,
          [auctionId, winnerId, finalBid],
        );

        // persist notification
        await client.query(
          `
          INSERT INTO auction_notifications (user_id, auction_id, type)
          VALUES ($1, $2, 'won')
          `,
          [winnerId, auctionId],
        );

        // emit websocket notifications
        global.wsService.emitAuctionEnded(auctionId);
        global.wsService.emitUserWon(winnerId, auctionId);

        const existingConversationId = await Message.getConversationIdByUserId(winnerId);

        const systemMessage = `*system message*

Congrats on the win! 
        
You can find your total, including shipping, payment methods, and print out an invoice all on your Account page. 

You will be provided a tracking # (on Account page) once payment is received. If there's anything else you need or have any questions let me know.  Thanks! -Kevin
`;

        const message = await Message.insert({
          userId: winnerId,
          messageContent: systemMessage,
          isFromAdmin: true,
          conversationId: existingConversationId || null,
        });
        // eslint-disable-next-line no-console
        console.log(`[Cron] Auction ${auctionId} expired — winner user ${winnerId} recorded.`);

        // Now emit to user real-time
        global.wsService.io.to(`user_${winnerId}`).emit('new_message', message);
        // eslint-disable-next-line no-console
        console.log(`[Cron] Sent winner message to user ${winnerId} for auction ${auctionId}`);
      } else {
        // 4. No winner case: still record result
        await client.query(
          `
          INSERT INTO auction_results (auction_id, closed_reason)
          VALUES ($1, 'expired')
          `,
          [auctionId],
        );

        global.wsService.emitAuctionEnded(auctionId);

        // eslint-disable-next-line no-console
        console.log(`[Cron] Auction ${auctionId} expired — no bids.`);
      }
    }

    await client.query('COMMIT'); // commit transaction if all succeeded
  } catch (err) {
    await client.query('ROLLBACK'); // undo all if any failure occurs
    console.error(`[Cron] Error completing auction ${auctionId}`, err);
  } finally {
    client.release(); // release connection back to pool
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
        global.wsService.emitAuctionEnded(id);
      });

      // eslint-disable-next-line no-console
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
    // eslint-disable-next-line no-console
    console.log(`[Cron] Timer firing for auction ${auctionId} at ${new Date().toISOString()}`);
    timers.delete(auctionId);
    await completeAuction(auctionId);
  }, delay);

  timers.set(auctionId, t);
  // eslint-disable-next-line no-console
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
    // eslint-disable-next-line no-console
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
    // eslint-disable-next-line no-console
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
