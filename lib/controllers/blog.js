const { Router } = require('express');
const BlogPost = require('../models/BlogPost.js');

module.exports = Router()
  .get('/', async (req, res, next) => {
    try {
      const posts = await BlogPost.getPublishedList();
      res.json(posts);
    } catch (error) {
      next(error);
    }
  })

  .get('/:slug', async (req, res, next) => {
    try {
      const post = await BlogPost.getPublishedBySlug(req.params.slug);
      if (!post) return res.status(404).json({ message: 'Blog post not found' });
      res.json(post);
    } catch (error) {
      next(error);
    }
  });
