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
  }

  static async insert({ email, passwordHash }) {
    const { rows } = await pool.query(
      `
      INSERT INTO users_admin ( email, password_hash)
      VALUES ($1, $2)
      RETURNING *
    `,
      [email, passwordHash],
    );

    return new User(rows[0]);
  }

  static async getAll() {
    const { rows } = await pool.query(
      `
      SELECT * FROM users_admin
      `,
    );
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
};
