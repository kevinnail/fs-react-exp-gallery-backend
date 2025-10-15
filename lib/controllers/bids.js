const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const Bid = require('../models/Bid.js');
const Auction = require('../models/Auction.js');
const Profile = require('../models/Profile.js');
const AuctionNotification = require('../models/AuctionNotification.js');

module.exports = Router()
  .get('/:id', async (req, res, next) => {
    try {
      const auctionId = req.params.id;
      const bids = await Bid.getByAuctionId(auctionId);

      // For each bid, fetch that user's profile and combine them
      const bidsWithProfiles = await Promise.all(
        bids.map(async (bid) => {
          const profile = await Profile.getByUserId(bid.userId);
          return {
            ...bid,
            user: profile || null,
          };
        }),
      );

      res.json(bidsWithProfiles);
    } catch (e) {
      next(e);
    }
  })

  .post('/', authenticate, async (req, res, next) => {
    try {
      const { auctionId, userId, bidAmount } = req.body;

      // Emit WebSocket event for real-time updates
      if (global.wsService) {
        global.wsService.emitBidPlaced(auctionId, userId, bidAmount);
      }
      const currentHighest = await Bid.getHighestBid(auctionId);

      if (currentHighest && currentHighest.userId !== userId) {
        if (global.wsService) {
          global.wsService.emitOutBidNotification(currentHighest.userId, auctionId, bidAmount);
        }

        await AuctionNotification.insert({
          userId: currentHighest.userId,
          auctionId,
          type: 'outbid',
        });
      }
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

      // Emit WebSocket event for real-time updates
      if (global.wsService) {
        global.wsService.emitAuctionBIN(auctionId);
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
