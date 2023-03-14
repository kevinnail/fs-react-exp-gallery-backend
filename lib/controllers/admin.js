const { Router } = require('express');
const authDelUp = require('../middleware/authDelUp');
const User = require('../models/User.js');
const Post = require('../models/Post.js');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();
const multer = require('multer');
const upload = multer({ dest: '/uploads' }); // This sets the upload destination directory

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

  .post('/upload', upload.array('imageFiles'), async (req, res, next) => {
    try {
      console.log(
        'req.files=======================================',
        req.files
      );

      const results = await Promise.all(
        req.files.map(
          async (file) => await cloudinary.uploader.upload(file.path)
        )
      );

      res.status(200).json(results);
    } catch (e) {
      console.error(e);
      next(e);
      res.status(500).send('An error occurred while uploading the images');
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
