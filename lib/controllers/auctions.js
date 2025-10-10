const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const Auction = require('../models/Auctions.js');

module.exports = Router().get('/', authenticate, async (req, res, next) => {
  try {
    // const auctions = [
    //   {
    //     id: 1,
    //     title: 'Ocean Twist Spoon Pipe',
    //     description:
    //       'A hand-blown glass spoon with deep ocean hues and silver fuming that shifts color in sunlight. Heavy wall thickness for durability and smooth draw.',
    //     image_urls: [
    //       'https://d224jc301x4m0c.cloudfront.net/stress-less-glass-auctions/ocean-twist-1.jpg',
    //       'https://d224jc301x4m0c.cloudfront.net/stress-less-glass-auctions/ocean-twist-2.jpg',
    //       'https://d224jc301x4m0c.cloudfront.net/stress-less-glass-auctions/ocean-twist-3.jpg',
    //     ],
    //     start_price: 40.0,
    //     buy_now_price: 90.0,
    //     current_bid: 55.0,
    //     start_time: '2025-10-09T18:00:00Z',
    //     end_time: '2025-10-11T18:00:00Z',
    //     is_active: true,
    //     creator_id: 1,
    //   },
    //   {
    //     id: 2,
    //     title: 'Galaxy Implosion Pendant',
    //     description:
    //       'Pendant featuring a vortex implosion of dichroic and silver glass — looks like a galaxy suspended in space. Includes stainless chain.',
    //     image_urls: [
    //       'https://d224jc301x4m0c.cloudfront.net/stress-less-glass-auctions/galaxy-pendant-1.jpg',
    //       'https://d224jc301x4m0c.cloudfront.net/stress-less-glass-auctions/galaxy-pendant-2.jpg',
    //       'https://d224jc301x4m0c.cloudfront.net/stress-less-glass-auctions/galaxy-pendant-3.jpg',
    //     ],
    //     start_price: 60.0,
    //     buy_now_price: 120.0,
    //     current_bid: 85.0,
    //     start_time: '2025-10-09T20:00:00Z',
    //     end_time: '2025-10-12T20:00:00Z',
    //     is_active: true,
    //     creator_id: 1,
    //   },
    //   {
    //     id: 3,
    //     title: 'Amber Fume Recycler Rig',
    //     description:
    //       'Compact recycler rig with amber fume sections and a smooth recycling function. 14mm joint, perfect for daily use or display.',
    //     image_urls: [
    //       'https://d224jc301x4m0c.cloudfront.net/stress-less-glass-auctions/amber-recycler-1.jpg',
    //       'https://d224jc301x4m0c.cloudfront.net/stress-less-glass-auctions/amber-recycler-2.jpg',
    //       'https://d224jc301x4m0c.cloudfront.net/stress-less-glass-auctions/amber-recycler-3.jpg',
    //     ],
    //     start_price: 120.0,
    //     buy_now_price: 240.0,
    //     current_bid: 160.0,
    //     start_time: '2025-10-08T22:00:00Z',
    //     end_time: '2025-10-13T22:00:00Z',
    //     is_active: true,
    //     creator_id: 1,
    //   },
    // ];

    const auctions = await Auction.getAllActive();
    res.json(auctions);
  } catch (e) {
    next(e);
  }
});
