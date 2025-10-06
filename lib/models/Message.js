const pool = require('../utils/pool');

module.exports = class Message {
  id;
  conversationId;
  userId;
  messageContent;
  sentAt;
  isRead;
  isFromAdmin;

  constructor(row) {
    this.id = row.id;
    this.conversationId = row.conversation_id;
    this.userId = row.user_id;
    this.messageContent = row.message_content;
    this.sentAt = row.sent_at;
    this.isRead = row.is_read;
    this.isFromAdmin = row.is_from_admin;
  }

  static async insert({ userId, messageContent, conversationId = null, isFromAdmin = false }) {
    let actualConversationId = conversationId;

    // If no conversationId provided, create a new conversation
    if (!actualConversationId) {
      // Get the next conversation ID by finding the max and adding 1
      const maxResult = await pool.query(
        'SELECT COALESCE(MAX(conversation_id), 0) + 1 as next_id FROM messages',
      );
      actualConversationId = maxResult.rows[0].next_id;
    }

    const { rows } = await pool.query(
      `
      INSERT INTO messages (conversation_id, user_id, message_content, is_from_admin)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
      [actualConversationId, userId, messageContent, isFromAdmin],
    );

    return new Message(rows[0]);
  }

  static async getAll() {
    const { rows } = await pool.query(
      `
      SELECT m.*, u.email 
      FROM messages m
      JOIN users_admin u ON m.user_id = u.id
      ORDER BY m.conversation_id DESC, m.sent_at ASC
    `,
    );
    return rows.map((row) => ({
      ...new Message(row),
      userEmail: row.email,
    }));
  }

  static async getConversations() {
    const { rows } = await pool.query(
      `
      SELECT 
        m.conversation_id,
        customer.user_id,
        u.email,
        MAX(m.sent_at) as last_message_at,
        COUNT(m.id) as message_count,
        COUNT(CASE WHEN m.is_read = false AND m.is_from_admin = false THEN 1 END) as unread_count
      FROM messages m
      JOIN (
        SELECT DISTINCT conversation_id, user_id 
        FROM messages 
        WHERE is_from_admin = false
      ) customer ON m.conversation_id = customer.conversation_id
      JOIN users_admin u ON customer.user_id = u.id
      GROUP BY m.conversation_id, customer.user_id, u.email
      ORDER BY last_message_at DESC
    `,
    );
    return rows;
  }

  static async getConversationById(conversationId) {
    const { rows } = await pool.query(
      `
      SELECT m.*, u.email 
      FROM messages m
      JOIN users_admin u ON m.user_id = u.id
      WHERE m.conversation_id = $1
      ORDER BY m.sent_at ASC
    `,
      [conversationId],
    );
    return rows.map((row) => ({
      ...new Message(row),
      userEmail: row.email,
    }));
  }

  static async getByUserId(userId) {
    const { rows } = await pool.query(
      `
      SELECT * FROM messages
      WHERE conversation_id IN (
        SELECT DISTINCT conversation_id 
        FROM messages 
        WHERE user_id = $1
      )
      ORDER BY conversation_id DESC, sent_at ASC
    `,
      [userId],
    );
    return rows.map((row) => new Message(row));
  }

  static async getById(id) {
    const { rows } = await pool.query(
      `
      SELECT * FROM messages
      WHERE id = $1
    `,
      [id],
    );

    if (!rows[0]) {
      throw new Error('Message not found');
    }

    return new Message(rows[0]);
  }

  static async markAsRead(id) {
    const { rows } = await pool.query(
      `
      UPDATE messages
      SET is_read = true
      WHERE id = $1
      RETURNING *
    `,
      [id],
    );

    return new Message(rows[0]);
  }

  static async addAdminReply(conversationId, adminReply) {
    // Get the user_id from the conversation
    const userResult = await pool.query(
      'SELECT user_id FROM messages WHERE conversation_id = $1 LIMIT 1',
      [conversationId],
    );

    if (!userResult.rows[0]) {
      throw new Error('Conversation not found');
    }

    const userId = userResult.rows[0].user_id;

    const { rows } = await pool.query(
      `
      INSERT INTO messages (conversation_id, user_id, message_content, is_from_admin)
      VALUES ($1, $2, $3, true)
      RETURNING *
    `,
      [conversationId, userId, adminReply],
    );

    return new Message(rows[0]);
  }

  static async delete(id) {
    const { rows } = await pool.query(
      `
      DELETE FROM messages
      WHERE id = $1
      RETURNING *
    `,
      [id],
    );

    return new Message(rows[0]);
  }
};
