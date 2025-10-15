const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

class WebSocketService {
  constructor(server) {
    this.io = new Server(server, {
      cors: {
        origin: [
          'http://localhost:3000',
          'http://localhost:7890',
          'https://fs-react-exp-gallery-kn.netlify.app',
          'https://stresslessglass.kevinnail.com',
        ],
        credentials: true,
      },
    });

    this.setupAuthentication();
    this.setupEventHandlers();
  }

  setupAuthentication() {
    this.io.use(async (socket, next) => {
      try {
        // Get the JWT token from the httpOnly cookie (same as your existing auth)
        const cookieHeader = socket.handshake.headers.cookie;

        if (!cookieHeader) {
          return next(new Error('Authentication error: No cookies provided'));
        }

        const cookies = this.parseCookies(cookieHeader);

        const token = cookies[process.env.COOKIE_NAME];

        if (!token) {
          return next(new Error('Authentication error: No session cookie found'));
        }

        // Use the same JWT verification as your existing authenticate middleware
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.getByEmail(decoded.email);

        if (!user) {
          return next(new Error('Authentication error: User not found'));
        }

        // Set user info on socket (same as your existing auth)
        socket.userId = user.id;
        socket.isAdmin = decoded.email === process.env.ALLOWED_EMAILS.split(',')[0];
        next();
      } catch (error) {
        console.error('WebSocket auth error:', error.message);
        next(new Error('Authentication error: Invalid session'));
      }
    });
  }

  parseCookies(cookieHeader) {
    const cookies = {};
    cookieHeader.split(';').forEach((cookie) => {
      const [name, value] = cookie.trim().split('=');
      cookies[name] = value;
    });
    return cookies;
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      // Join user to their personal room
      socket.join(`user_${socket.userId}`);

      // If admin, join admin room
      if (socket.isAdmin) {
        socket.join('admin_room');
      }

      // Handle joining conversation rooms
      socket.on('join_conversation', (conversationId) => {
        socket.join(`conversation_${conversationId}`);
      });

      // Handle leaving conversation rooms
      socket.on('leave_conversation', (conversationId) => {
        socket.leave(`conversation_${conversationId}`);
      });

      // Handle typing indicators
      socket.on('typing_start', (data) => {
        socket.to(`conversation_${data.conversationId}`).emit('user_typing', {
          userId: socket.userId,
          conversationId: data.conversationId,
          isTyping: true,
        });
      });

      socket.on('typing_stop', (data) => {
        socket.to(`conversation_${data.conversationId}`).emit('user_typing', {
          userId: socket.userId,
          conversationId: data.conversationId,
          isTyping: false,
        });
      });

      // Handle typing indicator (generic)
      socket.on('typing', (data) => {
        socket.to(`conversation_${data.conversationId}`).emit('user_typing', {
          userId: socket.userId,
          conversationId: data.conversationId,
          isTyping: data.isTyping,
        });
      });

      // Handle message sending via WebSocket
      socket.on('send_message', async (data) => {
        try {
          const Message = require('../models/Message');
          const message = await Message.insert({
            userId: socket.userId,
            messageContent: data.messageContent,
            conversationId: data.conversationId,
            isFromAdmin: socket.isAdmin,
          });

          // Emit to conversation room
          socket.to(`conversation_${data.conversationId}`).emit('new_message', message);

          // Notify admins if it's a customer message
          if (!socket.isAdmin) {
            socket.to('admin_room').emit('new_customer_message', {
              message,
              conversationId: data.conversationId,
            });
          }

          // Emit conversation update
          socket.to(`conversation_${data.conversationId}`).emit('conversation_updated', {
            conversationId: data.conversationId,
            lastMessage: message,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          socket.emit('error', { message: 'Failed to send message', error: error.message });
        }
      });

      // Handle marking message as read
      socket.on('mark_message_read', async (data) => {
        try {
          const Message = require('../models/Message');
          await Message.markAsRead(data.messageId);

          // Emit read status to conversation room
          socket.to(`conversation_${data.conversationId}`).emit('message_read', {
            messageId: data.messageId,
            conversationId: data.conversationId,
            readBy: socket.userId,
            readAt: new Date().toISOString(),
          });
        } catch (error) {
          socket.emit('error', { message: 'Failed to mark message as read', error: error.message });
        }
      });

      socket.on('disconnect', () => {
        console.info(`User ${socket.userId} disconnected from WebSocket`);
      });
    });
  }

  // Method to emit new message to relevant users
  emitNewMessage(message, conversationId) {
    this.io.to(`conversation_${conversationId}`).emit('new_message', message);

    // Also notify admins if it's a customer message
    if (!message.isFromAdmin) {
      this.io.to('admin_room').emit('new_customer_message', {
        message,
        conversationId,
      });
    }

    // Emit conversation update
    this.io.to(`conversation_${conversationId}`).emit('conversation_updated', {
      conversationId,
      lastMessage: message,
      timestamp: new Date().toISOString(),
    });
  }

  // Method to emit message read status
  emitMessageRead(messageId, conversationId) {
    this.io.to(`conversation_${conversationId}`).emit('message_read', {
      messageId,
      conversationId,
    });
  }

  emitAuctionCreated(auction) {
    this.io.emit('auction-created', { auction });
  }

  emitAuctionEnded(auctionId) {
    this.io.emit('auction-ended', { auctionId });
  }

  emitBidPlaced(auctionId) {
    this.io.emit('bid-placed', { auctionId });
  }

  emitAuctionBIN(auctionId) {
    this.io.emit('auction-BIN', auctionId);
  }
}

module.exports = WebSocketService;
