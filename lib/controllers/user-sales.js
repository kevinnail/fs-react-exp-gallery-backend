const { Router } = require('express');

module.exports = Router()
  // GET all auctions  ///////////////////////////////////////////
  .get('/', async (req, res, next) => {
    try {
      //   const sales = 'hitting new route';
      const sales = await GalleryPostSalse;
      res.json(sales);
    } catch (e) {
      next(e);
    }
  });
