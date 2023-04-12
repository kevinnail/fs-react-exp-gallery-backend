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

  .get('/search/:term', async (req, res, next) => {
    try {
      const data = await Gallery.searchGalleryPosts(req.params.term);
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
  })

  .get('/urls/:id', async (req, res, next) => {
    try {
      const data = await Gallery.getGalleryImagesByPostId(req.params.id);
      res.json(data);
    } catch (e) {
      next(e);
    }
  });
