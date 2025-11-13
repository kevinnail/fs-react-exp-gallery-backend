const pool = require('../utils/pool');

module.exports = class Profile {
  id;
  userId;
  firstName;
  lastName;
  imageUrl;
  createdAt;
  updatedAt;
  showWelcome;
  sendEmailNotifications;

  constructor(row) {
    this.id = row.id;
    this.userId = row.user_id;
    this.firstName = row.first_name;
    this.lastName = row.last_name;
    this.imageUrl = row.image_url;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
    this.showWelcome = row.show_welcome;
    this.sendEmailNotifications = row.send_email_notifications;
  }

  static async insert({ userId, firstName, lastName, imageUrl, sendEmailNotifications = true }) {
    const { rows } = await pool.query(
      `
INSERT INTO profiles (user_id, first_name, last_name, image_url, send_email_notifications)
VALUES ($1, $2, $3, $4, $5)
RETURNING *

    `,
      [userId, firstName, lastName, imageUrl, sendEmailNotifications],
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

  static async updateByUserId(userId, { firstName, lastName, imageUrl, sendEmailNotifications }) {
    const { rows } = await pool.query(
      `
      UPDATE profiles
      SET first_name = $2, last_name = $3, image_url = $4, send_email_notifications =$5, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *
    `,
      [userId, firstName, lastName, imageUrl, sendEmailNotifications],
    );

    if (!rows[0]) {
      throw new Error('Profile not found');
    }

    return new Profile(rows[0]);
  }

  static async upsertByUserId(userId, { firstName, lastName, imageUrl, sendEmailNotifications }) {
    const existingProfile = await Profile.getByUserId(userId);

    if (existingProfile) {
      return await Profile.updateByUserId(userId, {
        firstName,
        lastName,
        imageUrl,
        sendEmailNotifications,
      });
    } else {
      return await Profile.insert({
        userId,
        firstName,
        lastName,
        imageUrl,
        sendEmailNotifications,
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

  static async getUsersWithEmailNotifications() {
    const { rows } = await pool.query(`
    SELECT user_id, email, send_email_notifications, last_auction_email_at
    FROM profiles
    JOIN users_admin ON profiles.user_id = users_admin.id
    WHERE send_email_notifications = true
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
};
