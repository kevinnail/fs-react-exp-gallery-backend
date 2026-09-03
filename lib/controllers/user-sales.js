const { Router } = require('express');
const SalesOrder = require('../models/SalesOrder.js');
module.exports = Router()
  // GET all sales orders for the signed-in user  ///////////////////////////////////////////
  .get('/', async (req, res, next) => {
    try {
      const userId = req.user.id;
      const orders = await SalesOrder.getAllOrdersByUserId(userId);

      res.json(orders);
    } catch (e) {
      next(e);
    }
  });
