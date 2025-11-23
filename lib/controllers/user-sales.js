const { Router } = require('express');
const GalleryPostSale = require('../models/GalleryPostSale.js');
module.exports = Router()
  // GET all auctions  ///////////////////////////////////////////
  .get('/', async (req, res, next) => {
    try {
      const userId = req.user.id;
      const sales = await GalleryPostSale.getAllSalesByUserId(userId);

      res.json(sales);
    } catch (e) {
      next(e);
    }
  });
