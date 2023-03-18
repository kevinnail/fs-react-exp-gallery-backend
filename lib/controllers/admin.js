const { Router } = require('express'); // This is the Express Router
const authDelUp = require('../middleware/authDelUp');
const User = require('../models/User.js');
const Post = require('../models/Post.js');
const cloudinary = require('cloudinary').v2; // This is the cloudinary package
require('dotenv').config(); // This is the dotenv package
const multer = require('multer'); // This is the multer middleware
const upload = multer({ dest: '/uploads/' }); // This sets the upload destination directory
const folderPath = '/fs-react-ext-gallery'; // This sets the folder name in Cloudinary

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = Router()
  // image routes //////////////////////////////////////////////////////////////////////////
  // upload to cloudinary /////////////////////////////////
  .post('/upload', upload.array('imageFiles'), async (req, res) => {
    try {
      const results = await Promise.all(
        req.files.map(
          async (file) =>
            await cloudinary.uploader.upload(file.path, { folder: folderPath })
        )
      );
      // console.log('results', results);

      res.status(200).json(results);
    } catch (e) {
      console.error(e);
      // next(e);
      res.status(500).send('An error occurred while uploading the images');
    }
  })
  // store image urls and public ids in db /////////////////////////////////
  .post('/images', upload.none(), async (req, res, next) => {
    try {
      const post_id = req.body.id;
      const image_urls = JSON.parse(req.body.image_urls);
      const image_public_ids = JSON.parse(req.body.image_public_ids);

      const post = await Post.addGalleryImages(
        post_id,
        image_urls,
        image_public_ids
      );
      res.json(post);
    } catch (e) {
      next(e);
    }
  })
  // delete image from cloudinary /////////////////////////////////
  .post('/delete', upload.none(), async (req, res) => {
    console.log('req.body in .post admin.js', req.body.public_id);

    const public_id = req.body.public_id;
    console.log('');

    // const resource_type = 'image';

    if (!public_id) {
      res.status(400).json({ error: 'Public ID is required' });
      return;
    }

    try {
      const result = await cloudinary.uploader
        .destroy(public_id, 'image')
        .then((result) => console.log(result));

      if (result && result.result === 'ok') {
        res.status(200).json({ message: 'Image deleted successfully' });
      } else {
        res.status(500).json({ error: 'Failed to delete the image' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  })
  //  gallery post routes //////////////////////////////////////////////////////////////////////////
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
        req.user.id,
        req.body.public_id
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
