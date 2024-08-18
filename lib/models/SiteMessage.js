const pool = require('../utils/pool');

class SiteMessage {
  id;
  message;
  updatedAt;

  constructor(row) {
    this.id = row.id;
    this.message = row.message;
    this.updatedAt = row.updated_at;
  }

  static async getMessage() {
    const { rows } = await pool.query(
      'SELECT * FROM site_messages WHERE id = 1'
    );
    return new SiteMessage(rows[0]);
  }

  static async updateMessage(newMessage) {
    const { rows } = await pool.query(
      'UPDATE site_messages SET message = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1 RETURNING *',
      [newMessage]
    );
    return new SiteMessage(rows[0]);
  }
}

module.exports = SiteMessage;
