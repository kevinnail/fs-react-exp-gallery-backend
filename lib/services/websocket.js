const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendMessageNotificationEmail } = require('./notificationEmailService');

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
      console.info('[WS Debug] socket connected', {
        userId: socket.userId,
        isAdmin: socket.isAdmin,
        socketId: socket.id,
      });
      // Join user to their personal room
      socket.join(`user_${socket.userId}`);

      // If admin, join admin room
      if (socket.isAdmin) {
        socket.join('admin_room');
        console.info('[WS Debug] admin joined admin_room', {
          userId: socket.userId,
          socketId: socket.id,
        });
      }

      // Handle joining conversation rooms
      socket.on('join_conversation', (conversationId) => {
        socket.join(`conversation_${conversationId}`);
      });

      // Handle leaving conversation rooms
      socket.on('leave_conversation', (conversationId) => {
        socket.leave(`conversation_${conversationId}`);
      });

      socket.on('join_user_room', (userId) => {
        if (!userId) return;
        socket.join(`user_${userId}`);
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
          let message;

          // if messageId exists, DB insert already happened via REST
          if (data.messageId) {
            message = {
              id: data.messageId,
              userId: socket.userId,
              conversationId: data.conversationId,
              messageContent: data.messageContent,
              isFromAdmin: socket.isAdmin,
              sentAt: new Date().toISOString(),
            };
          } else {
            // normal real time insert (for second+ messages)
            const Message = require('../models/Message');
            message = await Message.insert({
              userId: socket.userId,
              messageContent: data.messageContent,
              conversationId: data.conversationId,
              isFromAdmin: socket.isAdmin,
            });
          }

          const recipientId = socket.isAdmin ? message.userId : process.env.ADMIN_ID;

          this.io.to(`user_${recipientId}`).emit('message_notify', {
            conversationId: data.conversationId,
            message,
          });

          socket.to(`conversation_${data.conversationId}`).emit('new_message', message);
          socket.emit('new_message', message);

          if (!socket.isAdmin) {
            socket.to('admin_room').emit('new_customer_message', {
              message,
              conversationId: data.conversationId,
            });
          }

          // Email notification: ONLY when admin sends a message
          if (socket.isAdmin) {
            try {
              // Resolve the conversation's customer (non-admin participant)
              const Message = require('../models/Message');
              const conversationMessages = await Message.getConversationById(data.conversationId);
              const customerMessage = conversationMessages.find((msg) => !msg.isFromAdmin);
              if (!customerMessage) {
                // eslint-disable-next-line
                console.warn('Email skip: no customer message found to resolve recipient', {
                  conversationId: data.conversationId,
                });
              } else {
                const recipient = await User.getEmailById(customerMessage.userId);
                const result = await sendMessageNotificationEmail({ user: recipient, message });
                if (result?.sent) {
                  // eslint-disable-next-line
                  console.log('Email sent for admin message', {
                    to: recipient.email,
                    conversationId: data.conversationId,
                    messageId: message.id,
                  });
                } else {
                  // eslint-disable-next-line
                  console.log('Email not sent for admin message', {
                    to: recipient.email,
                    conversationId: data.conversationId,
                    messageId: message.id,
                    reason: result?.reason || 'unknown',
                  });
                }
              }
            } catch (emailErr) {
              console.error('WebSocket message email notification failed:', emailErr);
            }
          }

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
        console.info('[WS Debug] socket disconnected', {
          userId: socket.userId,
          socketId: socket.id,
        });
      });
    });
  }

  // Method to emit new message to relevant users
  emitNewMessage(message, conversationId) {
    this.io.to(`conversation_${conversationId}`).emit('new_message', message);

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

  // Notify clients that an auction's end time has been extended
  emitAuctionExtended(auctionId, newEndTimeIso) {
    this.io.emit('auction-extended', { auctionId, newEndTime: newEndTimeIso });
  }

  emitBidPlaced(auctionId) {
    this.io.emit('bid-placed', { auctionId });
  }

  emitAuctionBIN(auctionId) {
    this.io.emit('auction-BIN', auctionId);
  }

  emitOutBidNotification(userId, auctionId, newBidAmount) {
    this.io.to(`user_${userId}`).emit('user-outbid', {
      auctionId,
      newBidAmount,
    });
  }

  emitUserWon(userId, auctionId) {
    this.io.to(`user_${userId}`).emit('user-won', {
      auctionId,
    });
  }

  emitTrackingInfo(userId, auctionId, trackingNumber) {
    this.io.to(`user_${userId}`).emit('tracking-info', {
      auctionId,
      trackingNumber,
    });
  }

  emitAuctionPaid(userId, auctionId, isPaid) {
    this.io.to(`user_${userId}`).emit('auction-paid', {
      auctionId,
      isPaid,
    });
  }

  // ===== Gallery Post Sales (non-auction) real-time events =====
  // Standard payload shape:
  // sale-paid: { type: 'sale', saleId, postId, userId, isPaid }
  // sale-tracking-info: { type: 'sale', saleId, postId, userId, trackingNumber }

  // Helper builders to avoid long ternary expressions (ESLint rule compliance)
  buildSalePaidPayload(saleOrPayload) {
    if (saleOrPayload.saleId) return saleOrPayload;
    return {
      type: 'sale',
      saleId: saleOrPayload.id,
      postId: saleOrPayload.post_id,
      userId: saleOrPayload.buyer_id,
      isPaid: saleOrPayload.is_paid,
    };
  }

  buildSaleTrackingPayload(saleOrPayload) {
    if (saleOrPayload.saleId) return saleOrPayload;
    return {
      type: 'sale',
      saleId: saleOrPayload.id,
      postId: saleOrPayload.post_id,
      userId: saleOrPayload.buyer_id,
      trackingNumber: saleOrPayload.tracking_number,
    };
  }

  buildSaleCreatedPayload(saleOrPayload) {
    if (saleOrPayload.saleId) return saleOrPayload;
    return {
      type: 'sale',
      saleId: saleOrPayload.id,
      postId: saleOrPayload.post_id,
      userId: saleOrPayload.buyer_id,
      price: saleOrPayload.price,
      trackingNumber: saleOrPayload.tracking_number,
      isPaid: saleOrPayload.is_paid,
    };
  }

  emitSalePaid(saleOrPayload) {
    const payload = this.buildSalePaidPayload(saleOrPayload);

    if (!payload?.userId) return; // cannot target user without id

    this.io.to(`user_${payload.userId}`).emit('sale-paid', payload);
    // Reflect across admin sessions
    this.io.to('admin_room').emit('sale-paid', payload);
  }

  emitSaleTrackingInfo(saleOrPayload) {
    const payload = this.buildSaleTrackingPayload(saleOrPayload);

    if (!payload?.userId) return;

    this.io.to(`user_${payload.userId}`).emit('sale-tracking-info', payload);
    this.io.to('admin_room').emit('sale-tracking-info', payload);
  }

  emitSaleCreated(saleOrPayload) {
    const payload = this.buildSaleCreatedPayload(saleOrPayload);

    if (!payload?.userId) return;

    console.info('[WS Debug] emitSaleCreated()', {
      userRoom: `user_${payload.userId}`,
      adminRoom: 'admin_room',
      payload,
    });

    this.io.to(`user_${payload.userId}`).emit('sale-created', payload);
    this.io.to('admin_room').emit('sale-created', payload);
  }
}
module.exports = WebSocketService;
