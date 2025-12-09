const pool = require('../utils/pool');

class ErrorLog {
  static async log(error, context = null) {
    const query = `
    INSERT INTO error_logs (error, context) VALUES ($1, $2)
    `;

    await pool.query(query, [error, context]);
  }

  static async getAll(limit = 100) {
    const query = `
    SELECT * FROM error_logs ORDER BY created_at DESC LIMIT $1
    `;

    const { rows } = await pool.query(query, [limit]);
    return rows;
  }
}

module.exports = ErrorLog;
