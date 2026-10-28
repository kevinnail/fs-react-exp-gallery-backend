const pool = require('../utils/pool');

const toMessage = (row) => ({
  id: row.id,
  role: row.role,
  content: row.content,
  createdAt: row.created_at,
});

const toSummary = (row) => ({
  id: row.id,
  title: row.title,
  granularity: row.granularity,
  range: row.range,
  updatedAt: row.updated_at,
});

// One insert per turn, in order, so ids follow conversation order.
const insertTurns = async (client, chatId, turns) => {
  const messages = [];
  for (const turn of turns) {
    const { rows } = await client.query(
      `
      INSERT INTO chart_chat_messages (chat_id, role, content)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [chatId, turn.role, turn.content],
    );
    messages.push(toMessage(rows[0]));
  }
  return messages;
};

module.exports = class ChartChat {
  id;
  title;
  granularity;
  range;
  createdAt;
  updatedAt;
  messages;

  constructor(row, messages = []) {
    this.id = row.id;
    this.title = row.title;
    this.granularity = row.granularity;
    this.range = row.range;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
    this.messages = messages;
  }

  static async getAll() {
    const { rows } = await pool.query(
      `
      SELECT id, title, granularity, range, updated_at
      FROM chart_chats
      ORDER BY updated_at DESC, id DESC
      `,
    );

    return rows.map(toSummary);
  }

  static async updateTitle(id, title) {
    const { rows } = await pool.query(
      `
      UPDATE chart_chats
      SET title = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, title, granularity, range, updated_at
      `,
      [id, title],
    );

    return rows[0] ? toSummary(rows[0]) : null;
  }

  static async deleteById(id) {
    const { rows } = await pool.query('DELETE FROM chart_chats WHERE id = $1 RETURNING id', [id]);

    return rows[0] ?? null;
  }

  static async getById(id) {
    const { rows } = await pool.query('SELECT * FROM chart_chats WHERE id = $1', [id]);

    if (!rows[0]) {
      return null;
    }

    const { rows: messageRows } = await pool.query(
      'SELECT * FROM chart_chat_messages WHERE chat_id = $1 ORDER BY id',
      [id],
    );

    return new ChartChat(rows[0], messageRows.map(toMessage));
  }

  // The chat row and its first turns land together or not at all.
  static async create({ title, granularity, range, turns }) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `
        INSERT INTO chart_chats (title, granularity, range)
        VALUES ($1, $2, $3)
        RETURNING *
        `,
        [title, granularity, range],
      );
      const messages = await insertTurns(client, rows[0].id, turns);

      await client.query('COMMIT');

      return new ChartChat(rows[0], messages);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Records the controls the turns were asked under, so reopening the chat
  // shows the same data. Returns null when the chat no longer exists.
  static async appendTurns(id, { granularity, range, turns }) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `
        UPDATE chart_chats
        SET granularity = $2,
            range = $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id
        `,
        [id, granularity, range],
      );

      if (!rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }

      const messages = await insertTurns(client, id, turns);

      await client.query('COMMIT');

      return messages;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};
