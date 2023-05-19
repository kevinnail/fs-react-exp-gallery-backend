const { Router } = require('express');
const Creator = require('../models/Creator.js');

module.exports = Router().get('/', async (req, res, next) => {
  try {
    const resp = await Creator.getAllCreators();
    res.json(resp);
  } catch (e) {
    next(e);
  }
});
