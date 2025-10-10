const pool = require('../utils/pool');

module.exports = class Profile {
  id;
  userId;
  firstName;
  lastName;
  imageUrl;
  createdAt;
  updatedAt;

  constructor(row) {
    this.id = row.id;
    this.userId = row.user_id;
    this.firstName = row.first_name;
    this.lastName = row.last_name;
    this.imageUrl = row.image_url;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  static async insert({ userId, firstName, lastName, imageUrl }) {
    const { rows } = await pool.query(
      `
      INSERT INTO profiles (user_id, first_name, last_name, image_url)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
      [userId, firstName, lastName, imageUrl],
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

  static async updateByUserId(userId, { firstName, lastName, imageUrl }) {
    const { rows } = await pool.query(
      `
      UPDATE profiles
      SET first_name = $2, last_name = $3, image_url = $4, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *
    `,
      [userId, firstName, lastName, imageUrl],
    );

    if (!rows[0]) {
      throw new Error('Profile not found');
    }

    return new Profile(rows[0]);
  }

  static async upsertByUserId(userId, { firstName, lastName, imageUrl }) {
    const existingProfile = await Profile.getByUserId(userId);

    if (existingProfile) {
      return await Profile.updateByUserId(userId, { firstName, lastName, imageUrl });
    } else {
      return await Profile.insert({ userId, firstName, lastName, imageUrl });
    }
  }
};
