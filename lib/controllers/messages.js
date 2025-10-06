const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validateId = require('../middleware/validateId');
const Message = require('../models/Message');

module.exports = Router()
  // Customer sends a message
  .post('/', authenticate, async (req, res, next) => {
    try {
      const { messageContent } = req.body;
      const userId = req.user.id;

      if (!messageContent) {
        return res.status(400).json({ error: 'Message content is required' });
      }

      const message = await Message.insert({ userId, messageContent });
      res.json(message);
    } catch (e) {
      next(e);
    }
  })

  // Customer gets their own messages
  .get('/my-messages', authenticate, async (req, res, next) => {
    try {
      const userId = req.user.id;
      const messages = await Message.getByUserId(userId);
      res.json(messages);
    } catch (e) {
      next(e);
    }
  })

  // Reply to a conversation (both admin and customer)
  .post('/conversations/:conversationId/reply', authenticate, async (req, res, next) => {
    try {
      const { conversationId } = req.params;
      const { messageContent } = req.body;
      const userId = req.user.id;

      if (!messageContent) {
        return res.status(400).json({ error: 'Message content is required' });
      }

      const message = await Message.insert({
        userId,
        messageContent,
        conversationId: parseInt(conversationId),
        isFromAdmin: req.isAdmin,
      });
      res.json(message);
    } catch (e) {
      next(e);
    }
  })

  // Admin gets all conversations
  .get('/conversations', [authenticate, authorize], async (req, res, next) => {
    try {
      const conversations = await Message.getConversations();
      res.json(conversations);
    } catch (e) {
      next(e);
    }
  })

  // Admin gets specific conversation
  .get('/conversations/:conversationId', [authenticate, authorize], async (req, res, next) => {
    try {
      const { conversationId } = req.params;
      const messages = await Message.getConversationById(conversationId);
      res.json(messages);
    } catch (e) {
      next(e);
    }
  })

  // Admin gets all messages (legacy endpoint)
  .get('/', [authenticate, authorize], async (req, res, next) => {
    try {
      const messages = await Message.getAll();
      res.json(messages);
    } catch (e) {
      next(e);
    }
  })

  // Admin marks message as read
  .patch('/:id/read', [authenticate, authorize, validateId()], async (req, res, next) => {
    try {
      const { id } = req.params;
      const message = await Message.markAsRead(id);
      res.json(message);
    } catch (e) {
      next(e);
    }
  })

  // Admin deletes a message
  .delete('/:id', [authenticate, authorize, validateId()], async (req, res, next) => {
    try {
      const { id } = req.params;
      const message = await Message.delete(id);
      res.json(message);
    } catch (e) {
      next(e);
    }
  });
