const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const Bid = require('../models/Bid.js');

module.exports = Router().get('/:id', async (req, res, next) => {
  try {
    const auctionId = req.params.id;

    const bids = await Bid.getByAuctionId(auctionId);

    res.json(bids);
  } catch (e) {
    next(e);
  }
});
