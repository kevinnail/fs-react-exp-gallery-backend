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
      if (!auctionId || !userId || !bidAmount) {
        return res.status(400).json({ error: 'auctionId, userId, and bidAmount are required' });
      }

      // get current highest bid
      const currentHighest = await Bid.getHighestBid(auctionId);

      // enforce strictly higher bid
      if (currentHighest && Number(bidAmount) <= Number(currentHighest.bidAmount)) {
        return res.status(409).json({
          message: 'Bid must be higher than current highest bid',
          currentHighest: currentHighest.bidAmount,
        });
      }

      // insert new bid
      const newBid = await Bid.insert({ auctionId, userId, bidAmount });

      // now that successful insert happened, emit events
      if (global.wsService) {
        global.wsService.emitBidPlaced(auctionId, userId, bidAmount);
      }

      // notify previous highest bidder if they exist and are different
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

      return res.status(201).json({ message: 'Bid placed successfully', bid: newBid });
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

      // We need the bid insert and auction close to be atomic. Start a client transaction
      const client = await require('../utils/pool').connect();
      try {
        await client.query('BEGIN');

        // insert a bid record for the buy-it-now amount
        const newBid = await Bid.insert(
          {
            auctionId,
            userId,
            bidAmount: auction.buyNowPrice,
          },
          client,
        );

        // mark it as closed and record result using the same client/transaction
        const result = await Auction.closeAuction(
          {
            auctionId,
            winnerId: userId,
            finalBid: auction.buyNowPrice,
            closedReason: 'buy_now',
          },
          client,
        );

        await client.query('COMMIT');

        // Emit WebSocket event for real-time updates after a successful commit
        if (global.wsService) {
          global.wsService.emitAuctionBIN(auctionId);
          global.wsService.emitBidPlaced(auctionId, userId, auction.buyNowPrice);
        }

        res.status(200).json({ message: 'Auction purchased successfully', result, bid: newBid });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (e) {
      next(e);
    }
  });
