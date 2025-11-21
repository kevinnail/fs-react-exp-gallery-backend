const { Router } = require('express');

module.exports = Router()
  // GET all auctions  ///////////////////////////////////////////
  .get('/', async (req, res, next) => {
    try {
      const sales = 'hitting new route';
      res.json(sales);
    } catch (e) {
      next(e);
    }
  });
