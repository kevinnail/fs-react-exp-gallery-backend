const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const Bid = require('../models/Bid.js');
const Auction = require('../models/Auction.js');

module.exports = Router()
  .get('/:id', async (req, res, next) => {
    try {
      const auctionId = req.params.id;

      const bids = await Bid.getByAuctionId(auctionId);

      res.json(bids);
    } catch (e) {
      next(e);
    }
  })

  .post('/', authenticate, async (req, res, next) => {
    try {
      const { auctionId, userId, bidAmount } = req.body;

      // Emit WebSocket event for real-time updates
      // if (global.wsService) {
      //   global.wsService.emitNewMessage(message, message.conversationId);
      // }

      await Bid.insert({ auctionId, userId, bidAmount });
      const message = 'Bid placed successfully';
      res.status(204).send(message);
    } catch (e) {
      next(e);
    }
  })

  .post('/buy-it-now', authenticate, async (req, res, next) => {
    try {
      const { auctionId, userId } = req.body;

      // fetch the auction to confirm it's active
      const auction = await Auction.getById(auctionId);
      if (!auction || !auction.isActive) {
        return res.status(400).json({ error: 'Auction already closed' });
      }

      // mark it as closed and record result
      const result = await Auction.closeAuction({
        auctionId,
        winnerId: userId,
        finalBid: auction.buyNowPrice,
        closedReason: 'buy_now',
      });

      res.status(200).json({ message: 'Auction purchased successfully', result });
    } catch (e) {
      next(e);
    }
  });
