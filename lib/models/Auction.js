const pool = require('../utils/pool');
const Profile = require('./Profile.js');

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
  isPaid;
  trackingNumber;

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
    this.isPaid = row.is_paid;
    this.trackingNumber = row.tracking_number;
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
      ORDER BY end_time DESC
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

  // Deletes auction_results first, then the auction, in a transaction
  static async deleteAuctionAndResultsById(id) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete auction_results first
      await client.query(
        `
        DELETE FROM auction_results 
        WHERE auction_id = $1
        `,
        [id],
      );

      // Delete the auction
      const { rows } = await client.query(
        `
        DELETE FROM auctions 
        WHERE id = $1 
        RETURNING *
        `,
        [id],
      );

      await client.query('COMMIT');
      if (!rows[0]) return null;
      return new Auction(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Accept an optional client to allow callers to manage transactions across multiple models.
  // If no client is provided, this method will create its own client and manage the transaction.
  static async closeAuction({ auctionId, winnerId, finalBid, closedReason }, client = null) {
    let localClient = client;
    let createdClient = false;

    if (!localClient) {
      localClient = await pool.connect();
      createdClient = true;
      await localClient.query('BEGIN');
    }

    try {
      await localClient.query(
        `
      UPDATE auctions
      SET is_active = false
      WHERE id = $1
      RETURNING *;
      `,
        [auctionId],
      );

      const { rows } = await localClient.query(
        `
      INSERT INTO auction_results (auction_id, winner_id, final_bid, closed_reason)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
      `,
        [auctionId, winnerId, finalBid, closedReason],
      );

      if (createdClient) {
        await localClient.query('COMMIT');
      }

      return rows[0];
    } catch (err) {
      if (createdClient) {
        await localClient.query('ROLLBACK');
      }
      throw err;
    } finally {
      if (createdClient) {
        localClient.release();
      }
    }
  }

  static async getUserAuctionWins(userId) {
    const { rows } = await pool.query(
      `
SELECT ar.*, a.title, a.image_urls, a.buy_now_price
FROM auction_results ar
JOIN auctions a ON ar.auction_id = a.id
WHERE ar.winner_id = $1
ORDER BY ar.closed_at DESC

    `,
      [userId],
    );

    return rows.map((r) => ({
      id: r.id,
      auctionId: r.auction_id,
      winnerId: r.winner_id,
      finalBid: Number(r.final_bid),
      closedAt: r.closed_at,
      closedReason: r.closed_reason,
      isPaid: r.is_paid === true,
      title: r.title,
      imageUrls: r.image_urls,
      buyNowPrice: r.buy_now_price,
      trackingNumber: r.tracking_number,
    }));
  }

  static async markPaid(auctionId, isPaid) {
    const { rows } = await pool.query(
      `
    UPDATE auction_results
    SET is_paid = $2
    WHERE auction_id = $1
    RETURNING *
    `,
      [auctionId, isPaid],
    );

    if (!rows[0]) throw new Error('Auction result not found');
    return rows[0];
  }

  static async getAllForAdmin() {
    const { rows } = await pool.query(
      `
    SELECT 
      a.*,
      ar.is_paid,
      ar.tracking_number
    FROM auctions a
    LEFT JOIN auction_results ar 
      ON ar.auction_id = a.id
    ORDER BY a.end_time DESC
    `,
    );

    return rows.map((row) => new Auction(row));
  }

  static async updateTrackingNumber(auctionId, trackingNumber) {
    const { rows } = await pool.query(
      `
    UPDATE auction_results
    SET tracking_number = $2
    WHERE auction_id = $1
    RETURNING *
    `,
      [auctionId, trackingNumber],
    );

    if (!rows[0]) throw new Error('Auction result not found');
    return rows[0];
  }

  static async getAuctionResults(auctionId) {
    const { rows } = await pool.query(
      `
      SELECT closed_reason, winner_id
      FROM auction_results
      WHERE auction_id = $1
      `,
      [auctionId],
    );

    if (!rows[0]) return null;

    const reason = rows[0].closed_reason;
    const { firstName, imageUrl } = await Profile.getByUserId(rows[0].winner_id);
    const profile = { firstName, imageUrl };

    return { reason, profile };
  }
};
