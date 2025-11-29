const pool = require('../utils/pool');
const Post = require('./Post.js');

module.exports = class User {
  id;
  email;
  galleryPosts;
  #passwordHash; // private class field: hides it from anything outside of this class definition

  constructor(row) {
    this.id = row.id;
    this.email = row.email;
    this.#passwordHash = row.password_hash;
    this.isVerified = row.is_verified;
    this.verificationTokenVersion = row.verification_token_version;
  }

  static async insert({ email, passwordHash, is_verified = false }) {
    const { rows } = await pool.query(
      `
      INSERT INTO users_admin ( email, password_hash, is_verified, verification_token_version)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
      [email, passwordHash, is_verified, 1],
    );

    return new User(rows[0]);
  }

  static async getAll() {
    const { rows } = await pool.query(`
    SELECT 
      u.*,
      p.created_at AS profile_created_at
    FROM users_admin u
    LEFT JOIN profiles p
      ON p.user_id = u.id
    ORDER BY p.created_at DESC
  `);

    return rows.map((row) => new User(row));
  }

  static async getByEmail(email) {
    const { rows } = await pool.query(
      `
      SELECT *
      FROM users_admin
      WHERE email=$1
      `,
      [email],
    );

    if (!rows[0]) {
      throw new Error('User not found');
    }

    return new User(rows[0]);
  }

  static async getById(id) {
    const { rows } = await pool.query(
      `
      SELECT *
      FROM users_admin
      WHERE id=$1
      `,
      [id],
    );

    if (!rows[0]) {
      throw new Error('User not found');
    }

    return new User(rows[0]);
  }

  static async getEmailById(id) {
    const { rows } = await pool.query(
      `
      SELECT *
      FROM users_admin
      WHERE id=$1
      `,
      [id],
    );

    if (!rows[0]) {
      throw new Error('User not found');
    }

    return new User(rows[0]);
  }

  get passwordHash() {
    return this.#passwordHash;
  }

  async getGalleryPosts() {
    const { rows } = await pool.query(
      `
      SELECT * FROM gallery_posts
      WHERE author_id=$1
      ORDER BY created_at DESC;
      
    `,
      [this.id],
    );

    return (this.galleryPosts = rows.map((row) => new Post(row)));
  }

  static async verifyUser(userId) {
    const { rows } = await pool.query(
      `
    UPDATE users_admin 
    SET is_verified = TRUE 
    WHERE id = $1
    RETURNING *
    `,
      [userId],
    );

    return new User(rows[0]);
  }

  static async incrementVerifyTokenVersion(userId) {
    const { rows } = await pool.query(
      `
      UPDATE users_admin
      SET verification_token_version = verification_token_version + 1
      WHERE id = $1
      RETURNING *
      `,
      [userId],
    );
    return new User(rows[0]);
  }
};
