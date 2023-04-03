const { Router } = require('express');
const Gallery = require('../models/MainGallery.js');

module.exports = Router().get('/', async (req, res, next) => {
  try {
    const data = await Gallery.getGalleryPosts();
    res.json(data);
  } catch (e) {
    next(e);
  }
});
