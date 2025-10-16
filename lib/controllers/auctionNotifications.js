const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const AuctionNotification = require('../models/AuctionNotification.js');

module.exports = Router()
  // Get unread auction notifications for the current user
  .get('/', authenticate, async (req, res, next) => {
    try {
      const userId = req.user.id;
      const notifications = await AuctionNotification.getUnreadByUserId(userId);
      res.json(notifications);
    } catch (e) {
      next(e);
    }
  })

  // Mark all auction notifications as read for the current user
  .patch('/mark-read', authenticate, async (req, res, next) => {
    try {
      const userId = req.user.id;
      await AuctionNotification.markAsRead(userId);
      res.json({ message: 'All auction notifications marked as read' });
    } catch (e) {
      next(e);
    }
  });

// ^ Was prebuilt- could come in handy, corresponding fetch on front end as well
// Optional: Get all notifications (read + unread)
// .get('/all', authenticate, async (req, res, next) => {
//   try {
//     const userId = req.user.id;
//     const notifications = await AuctionNotification.getUnreadByUserId(userId);
//     res.json(notifications);
//   } catch (e) {
//     next(e);
//   }
// });
