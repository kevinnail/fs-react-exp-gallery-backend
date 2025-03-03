const { Router } = require('express');
const Gallery = require('../models/MainGallery.js');
const SiteMessage = require('../models/SiteMessage.js');

module.exports = Router()
  .get('/', async (req, res, next) => {
    try {
      const data = await Gallery.getGalleryPosts();
      res.json(data);
    } catch (e) {
      next(e);
    }
  })

  .get('/home-message', async (req, res, next) => {
    try {
      const message = await SiteMessage.getMessage();
      res.json(message);
    } catch (error) {
      next(error);
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
      const galleryId = req.params.id;
      if (!/^\d+$/.test(galleryId)) {
        return null;
      }
      const data = await Gallery.getGalleryPostById(galleryId);
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
