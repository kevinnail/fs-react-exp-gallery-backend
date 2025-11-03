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

      // Emit WebSocket event for real-time updates
      // WebSocket: notify user ONLY if admin sent it
      if (global.wsService && req.isAdmin) {
        // Get all messages in this conversation to find the user
        const conversationMessages = await Message.getConversationById(conversationId);

        const customerMessage = conversationMessages.find((msg) => !msg.isFromAdmin);

        if (customerMessage) {
          global.wsService.io.to(`user_${customerMessage.userId}`).emit('new_message', message);
        }
      }

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

  // Mark message as read (admin or user)
  .patch('/:id/read', [authenticate, validateId()], async (req, res, next) => {
    try {
      const { id } = req.params;

      const updatedMessage = await Message.markAsRead(id);

      // Emit WebSocket event for real-time read status updates
      if (global.wsService) {
        global.wsService.emitMessageRead(id, updatedMessage.conversationId);
      }

      res.json(updatedMessage);
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
