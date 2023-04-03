const { Router } = require('express');
const Gallery = require('../models/MainGallery.js');

module.exports = Router()
  .get('/', async (req, res, next) => {
    try {
      const data = await Gallery.getGalleryPosts();
      res.json(data);
    } catch (e) {
      next(e);
    }
  })

  .get('/:id', async (req, res, next) => {
    try {
      const data = await Gallery.getGalleryPostById(req.params.id);
      res.json(data);
    } catch (e) {
      next(e);
    }
  });
