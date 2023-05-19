const pool = require('../utils/pool.js');

module.exports = class Creator {
  id;
  artist_name;
  first_name;
  last_name;
  email;

  constructor(row) {
    this.id = row.id;
    this.artist_name = row.artist_name;
    this.first_name = row.first_name;
    this.last_name = row.last_name;
    this.email = row.email;
  }

  static async getAllCreators() {
    const { rows } = await pool.query(
      `
      SELECT * FROM creators
      `
    );

    return rows.map((row) => new Creator(row));
  }
};
