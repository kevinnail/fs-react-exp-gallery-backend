const pool = require('../utils/pool');

module.exports = class AuctionNotification {
  id;
  userId;
  auctionId;
  type;
  createdAt;
  isRead;

  constructor(row) {
    this.id = row.id;
    this.userId = row.user_id;
    this.auctionId = row.auction_id;
    this.type = row.type;
    this.createdAt = row.created_at;
    this.isRead = row.is_read;
  }

  static async insert({ userId, auctionId, type }) {
    const { rows } = await pool.query(
      `
      INSERT INTO auction_notifications (user_id, auction_id, type)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [userId, auctionId, type],
    );

    if (!rows[0]) return null;
    return new AuctionNotification(rows[0]);
  }

  static async getUnreadByUserId(userId) {
    const { rows } = await pool.query(
      `
      SELECT * FROM auction_notifications
      WHERE user_id = $1 AND is_read = false
      ORDER BY created_at DESC
      `,
      [userId],
    );

    if (!rows.length) return [];
    return rows.map((row) => new AuctionNotification(row));
  }

  static async markAsRead(userId) {
    const { rows } = await pool.query(
      `
      UPDATE auction_notifications
      SET is_read = true
      WHERE user_id = $1
      RETURNING *
      `,
      [userId],
    );

    if (!rows.length) return [];
    return rows.map((row) => new AuctionNotification(row));
  }
};
