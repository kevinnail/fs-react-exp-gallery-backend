const pool = require('../utils/pool');

module.exports = class Bid {
  id;
  auctionId;
  userId;
  bidAmount;
  createdAt;
  updatedAt;

  constructor(row) {
    this.id = row.id;
    this.auctionId = row.auction_id;
    this.userId = row.user_id;
    this.bidAmount = row.bid_amount;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  // Accept an optional client so this can participate in an external transaction.
  // If no client is provided, fall back to the pool.
  static async insert({ auctionId, userId, bidAmount }, client = null) {
    const runner = client || pool;
    const { rows } = await runner.query(
      `
      INSERT INTO bids (auction_id, user_id, bid_amount)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [auctionId, userId, bidAmount],
    );

    if (!rows[0]) return null;
    return new Bid(rows[0]);
  }

  static async getByAuctionId(auctionId) {
    const { rows } = await pool.query(
      `
      SELECT * FROM bids
      WHERE auction_id = $1
      ORDER BY bid_amount DESC, created_at ASC
      `,
      [auctionId],
    );

    if (!rows.length) return [];
    return rows.map((row) => new Bid(row));
  }

  static async getHighestBid(auctionId) {
    const { rows } = await pool.query(
      `
      SELECT * FROM bids
      WHERE auction_id = $1
      ORDER BY bid_amount DESC, created_at ASC
      LIMIT 1
      `,
      [auctionId],
    );

    if (!rows[0]) return null;
    return new Bid(rows[0]);
  }

  static async getByUserId(userId) {
    const { rows } = await pool.query(
      `
      SELECT * FROM bids
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId],
    );

    if (!rows.length) return [];
    return rows.map((row) => new Bid(row));
  }

  static async deleteByAuctionId(auctionId) {
    const { rows } = await pool.query(
      `
      DELETE FROM bids
      WHERE auction_id = $1
      RETURNING *
      `,
      [auctionId],
    );

    if (!rows.length) return [];
    return rows.map((row) => new Bid(row));
  }
};
