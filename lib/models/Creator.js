const pool = require('../utils/pool.js');

module.exports = class Creator {
  id;
  artist_name;
  first_name;
  last_name;
  email;
  bio;

  constructor(row) {
    this.id = row.id;
    this.artist_name = row.artist_name;
    this.first_name = row.first_name;
    this.last_name = row.last_name;
    this.email = row.email;
    this.bio = row.bio;
  }

  static async getAllCreators() {
    const { rows } = await pool.query(
      `
      SELECT * FROM creators
      `
    );

    return rows.map((row) => new Creator(row));
  }

  static async getCreatorById(id) {
    const { rows } = await pool.query(
      `
      SELECT * FROM creators
      WHERE id = $1
      `,
      [id]
    );

    if (!rows[0]) return null;
    return new Creator(rows[0]);
  }

  static async addCreator({ artist_name, first_name, last_name, email, bio }) {
    const { rows } = await pool.query(
      `
      INSERT INTO creators (artist_name, first_name, last_name, email, bio)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [artist_name, first_name, last_name, email, bio]
    );
    if (!rows[0]) return null;
    return new Creator(rows[0]);
  }
};
