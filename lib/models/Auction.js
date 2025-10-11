const pool = require('../utils/pool');

module.exports = class Auction {
  id;
  title;
  description;
  imageUrls;
  startPrice;
  buyNowPrice;
  currentBid;
  startTime;
  endTime;
  isActive;
  creatorId;
  createdAt;
  updatedAt;

  constructor(row) {
    this.id = row.id;
    this.title = row.title;
    this.description = row.description;
    this.imageUrls = row.image_urls;
    this.startPrice = row.start_price;
    this.buyNowPrice = row.buy_now_price;
    this.currentBid = row.current_bid;
    this.startTime = row.start_time;
    this.endTime = row.end_time;
    this.isActive = row.is_active;
    this.creatorId = row.creator_id;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  static async insert({
    title,
    description,
    imageUrls = [],
    startPrice,
    buyNowPrice,
    currentBid,
    startTime,
    endTime,
    isActive = true,
    creatorId = 1,
  }) {
    const { rows } = await pool.query(
      `
      INSERT INTO auctions (
        title,
        description,
        image_urls,
        start_price,
        buy_now_price,
        current_bid,
        start_time,
        end_time,
        is_active,
        creator_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
      `,
      [
        title,
        description,
        imageUrls,
        startPrice,
        buyNowPrice,
        currentBid,
        startTime,
        endTime,
        isActive,
        creatorId,
      ],
    );

    return new Auction(rows[0]);
  }

  static async getAllActive() {
    const { rows } = await pool.query(
      `
      SELECT *
      FROM auctions
      ORDER BY end_time ASC
      `,
    );

    return rows.map((row) => new Auction(row));
  }

  static async getById(id) {
    const { rows } = await pool.query(
      `
      SELECT *
      FROM auctions
      WHERE id = $1
      `,
      [id],
    );

    if (!rows[0]) return null;
    return new Auction(rows[0]);
  }

  static async updateById(id, fields) {
    const current = await Auction.getById(id);
    if (!current) throw new Error('Auction not found');

    const updated = {
      title: fields.title ?? current.title,
      description: fields.description ?? current.description,
      imageUrls: fields.imageUrls ?? current.imageUrls,
      startPrice: fields.startPrice ?? current.startPrice,
      buyNowPrice: fields.buyNowPrice ?? current.buyNowPrice,
      currentBid: fields.currentBid ?? current.currentBid,
      startTime: fields.startTime ?? current.startTime,
      endTime: fields.endTime ?? current.endTime,
      isActive: fields.isActive ?? current.isActive,
      creatorId: 1,
    };

    const { rows } = await pool.query(
      `
      UPDATE auctions
      SET
        title = $2,
        description = $3,
        image_urls = $4,
        start_price = $5,
        buy_now_price = $6,
        current_bid = $7,
        start_time = $8,
        end_time = $9,
        is_active = $10,
        creator_id = $11,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [
        id,
        updated.title,
        updated.description,
        updated.imageUrls,
        updated.startPrice,
        updated.buyNowPrice,
        updated.currentBid,
        updated.startTime,
        updated.endTime,
        updated.isActive,
        updated.creatorId,
      ],
    );

    return new Auction(rows[0]);
  }

  static async deleteById(id) {
    const { rows } = await pool.query(
      `
      DELETE FROM auctions
      WHERE id = $1
      RETURNING *
      `,
      [id],
    );

    if (!rows[0]) return null;
    return new Auction(rows[0]);
  }

  static async recordResult({ auctionId, winnerId, finalBid, closedReason }) {
    const { rows } = await pool.query(
      `
    INSERT INTO auction_results (auction_id, winner_id, final_bid, closed_reason)
    VALUES ($1, $2, $3, $4)
    RETURNING *;
    `,
      [auctionId, winnerId, finalBid, closedReason],
    );
    return rows[0];
  }

  static async closeAuction({ auctionId, winnerId, finalBid, closedReason }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `
      UPDATE auctions
      SET is_active = false
      WHERE id = $1
      RETURNING *;
      `,
        [auctionId],
      );

      const { rows } = await client.query(
        `
      INSERT INTO auction_results (auction_id, winner_id, final_bid, closed_reason)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
      `,
        [auctionId, winnerId, finalBid, closedReason],
      );

      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async getUserAuctionWins(userId) {
    const { rows } = await pool.query(
      `
      SELECT * FROM auction_results
      WHERE winner_Id = $1
      ORDER BY closed_at DESC
  `,
      [userId],
    );
    return rows.map((row) => new Auction(row));
  }
};
