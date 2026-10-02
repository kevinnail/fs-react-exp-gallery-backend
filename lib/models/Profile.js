const pool = require('../utils/pool');

// Fixed map so a category name never reaches the SQL text
const EMAIL_CATEGORY_COLUMNS = {
  auctions: 'email_auctions',
  galleryPosts: 'email_gallery_posts',
  promotions: 'email_promotions',
};

module.exports = class Profile {
  id;
  userId;
  firstName;
  lastName;
  imageUrl;
  createdAt;
  updatedAt;
  showWelcome;
  emailAuctions;
  emailGalleryPosts;
  emailPromotions;
  emailMessages;
  lastMessageEmailAt;

  constructor(row) {
    this.id = row.id;
    this.userId = row.user_id;
    this.firstName = row.first_name;
    this.lastName = row.last_name;
    this.imageUrl = row.image_url;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
    this.showWelcome = row.show_welcome;
    this.emailAuctions = row.email_auctions;
    this.emailGalleryPosts = row.email_gallery_posts;
    this.emailPromotions = row.email_promotions;
    this.emailMessages = row.email_messages;
    this.lastMessageEmailAt = row.last_message_email_at;
  }

  static async insert({
    userId,
    firstName,
    lastName,
    imageUrl,
    emailAuctions = true,
    emailGalleryPosts = true,
    emailPromotions = true,
    emailMessages = true,
  }) {
    const { rows } = await pool.query(
      `
INSERT INTO profiles (user_id, first_name, last_name, image_url, email_auctions, email_gallery_posts, email_promotions, email_messages)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *

    `,
      [
        userId,
        firstName,
        lastName,
        imageUrl,
        emailAuctions,
        emailGalleryPosts,
        emailPromotions,
        emailMessages,
      ],
    );

    return new Profile(rows[0]);
  }

  static async getByUserId(userId) {
    const { rows } = await pool.query(
      `
      SELECT *
      FROM profiles
      WHERE user_id = $1
    `,
      [userId],
    );

    if (!rows[0]) {
      return null;
    }

    return new Profile(rows[0]);
  }

  static async getAllProfiles() {
    const { rows } = await pool.query(
      `
      SELECT * FROM profiles
    `,
    );

    return rows.map((row) => new Profile(row));
  }

  static async updateByUserId(
    userId,
    {
      firstName,
      lastName,
      imageUrl,
      emailAuctions,
      emailGalleryPosts,
      emailPromotions,
      emailMessages,
    },
  ) {
    const { rows } = await pool.query(
      `
      UPDATE profiles
      SET first_name = $2, last_name = $3, image_url = $4, email_auctions = $5,
          email_gallery_posts = $6, email_promotions = $7, email_messages = $8,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *
    `,
      [
        userId,
        firstName,
        lastName,
        imageUrl,
        emailAuctions,
        emailGalleryPosts,
        emailPromotions,
        emailMessages,
      ],
    );

    if (!rows[0]) {
      throw new Error('Profile not found');
    }

    return new Profile(rows[0]);
  }

  static async upsertByUserId(
    userId,
    {
      firstName,
      lastName,
      imageUrl,
      emailAuctions,
      emailGalleryPosts,
      emailPromotions,
      emailMessages,
    },
  ) {
    const existingProfile = await Profile.getByUserId(userId);

    if (existingProfile) {
      return await Profile.updateByUserId(userId, {
        firstName,
        lastName,
        imageUrl,
        emailAuctions,
        emailGalleryPosts,
        emailPromotions,
        emailMessages,
      });
    } else {
      return await Profile.insert({
        userId,
        firstName,
        lastName,
        imageUrl,
        emailAuctions,
        emailGalleryPosts,
        emailPromotions,
        emailMessages,
      });
    }
  }

  static async removeWelcomeMessage(userId) {
    const { rows } = await pool.query(
      `
      UPDATE profiles
      SET show_welcome = false
      WHERE user_id = $1
      RETURNING *
    `,
      [userId],
    );

    if (!rows[0]) {
      throw new Error('Profile not found');
    }

    return rows[0];
  }

  static async getEmailRecipients(category) {
    const column = EMAIL_CATEGORY_COLUMNS[category];
    if (!column) throw new Error(`Unknown email category: ${category}`);

    const { rows } = await pool.query(`
    SELECT user_id, email, last_auction_email_at, last_post_email_at
    FROM profiles
    JOIN users_admin ON profiles.user_id = users_admin.id
    WHERE ${column} = true
  `);

    return rows;
  }

  static async updateLastAuctionEmailTimestamp(userId, ts) {
    await pool.query(
      `
    UPDATE profiles
    SET last_auction_email_at = $2
    WHERE user_id = $1
  `,
      [userId, ts],
    );
  }

  static async updateLastPostEmailTimestamp(userId, ts) {
    await pool.query(
      `
    UPDATE profiles
    SET last_post_email_at = $2
    WHERE user_id = $1
  `,
      [userId, ts],
    );
  }

  static async updateLastMessageEmailTimestamp(userId, ts) {
    await pool.query(
      `
    UPDATE profiles
    SET last_message_email_at = $2
    WHERE user_id = $1
  `,
      [userId, ts],
    );
  }
};
