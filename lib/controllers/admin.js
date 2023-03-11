const { Router } = require('express');
const authDelUp = require('../middleware/authDelUp');
const User = require('../models/User.js');
const Post = require('../models/Post.js');

module.exports = Router()
  .get('/', async (req, res, next) => {
    try {
      const user = await User.getByEmail(req.user.email);
      await user.getGalleryPosts();
      res.json(user.galleryPosts);
    } catch (e) {
      next(e);
    }
  })

  .post('/', async (req, res, next) => {
    try {
      const post = await Post.postNewPost(
        req.body.title,
        req.body.description,
        req.body.image_url,
        req.body.category,
        req.body.price,
        req.user.id
      );
      res.json(post);
    } catch (e) {
      next(e);
    }
  })

  .put('/:id', [authDelUp], async (req, res, next) => {
    try {
      const data = await Post.updateById(
        req.body.id,
        req.body.post.title,
        req.body.post.description,
        req.body.post.image_url,
        req.body.post.category,
        req.body.post.price,
        req.body.post.author_id
      );

      res.json(data);
    } catch (e) {
      next(e);
    }
  })

  .delete('/:id', [authDelUp], async (req, res) => {
    const data = await Post.deleteById(req.params.id);
    res.json(data);
  })

  .get('/:id', [authDelUp], async (req, res, next) => {
    try {
      const data = await Post.getById(req.params.id);
      res.json(data);
    } catch (e) {
      next(e);
    }
  });
