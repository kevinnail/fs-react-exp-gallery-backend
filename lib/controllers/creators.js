const { Router } = require('express');
const Creator = require('../models/Creator.js');

module.exports = Router()
  .get('/:id', async (req, res, next) => {
    try {
      const resp = await Creator.getCreatorById(req.params.id);
      res.json(resp);
    } catch (e) {
      next(e);
    }
  })
  .get('/', async (req, res, next) => {
    try {
      const resp = await Creator.getAllCreators();
      res.json(resp);
    } catch (e) {
      next(e);
    }
  })

  .post('/', async (req, res, next) => {
    try {
      const resp = await Creator.addCreator(req.body);
      res.json(resp);
    } catch (e) {
      next(e);
    }
  });
