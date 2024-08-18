const { Router } = require('express'); // This is the Express Router
const authDelUp = require('../middleware/authDelUp');
const User = require('../models/User.js');
const Post = require('../models/Post.js');
require('dotenv').config(); // This is the dotenv package
// const upload = multer({ dest: '/uploads/' }); // This sets the upload destination directory
// const folderPath = '/fs-react-ext-gallery'; // This sets the folder name in Cloudinary

const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2; // This is the cloudinary package
const multer = require('multer'); // This is the multer middleware
const SiteMessage = require('../models/SiteMessage.js');
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'fs-react-ext-gallery', // optional, create a folder to organize your files
    allowed_formats: ['jpg', 'png', 'jpeg'], // optional, specify allowed formats
    public_id: (req, file) => file.public_id, // optional, set a unique name for each file
  },
});

const upload = multer({ storage });
module.exports = {
  upload: multer({ storage }),
};
module.exports = Router()
  .put('/home-message', async (req, res, next) => {
    try {
      const updatedMessage = await SiteMessage.updateMessage(req.body.message);
      res.json(updatedMessage);
    } catch (error) {
      next(error);
    }
  })

  .post('/discounts', async (req, res) => {
    try {
      const { action, percentage } = req.body;
      const discountMultiplier = (100 - percentage) / 100;

      // Assuming you have a way to fetch posts, for example through a user
      const user = await User.getByEmail(req.user.email);
      await user.getGalleryPosts();

      for (const postData of user.galleryPosts) {
        const post = new Post(postData);

        if (action === 'apply') {
          if (!post.originalPrice) {
            post.originalPrice = post.price;
          }
          post.discountedPrice = (
            parseFloat(post.originalPrice) * discountMultiplier
          ).toString();
        } else if (action === 'undo') {
          post.discountedPrice = post.originalPrice;
        }

        await post.saveBulkEditPost(); // Save the updated post back to the database
      }

      res
        .status(200)
        .json({ message: 'Discounts applied/removed successfully' });
    } catch (error) {
      console.error('Error applying discounts:', error);
      res.status(500).send('An error occurred while applying discounts');
    }
  })

  // image routes ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // POST upload image files to cloudinary /////////////////////////////////
  .post('/upload', upload.array('imageFiles'), async (req, res) => {
    try {
      const results = req.files.map((file) => {
        // Extract Cloudinary response data from the file object
        const public_id = file.filename;
        const secure_url = file.path;
        return { public_id, secure_url };
      });

      res.status(200).json(results);
    } catch (e) {
      console.error(e);
      // next(e);
      res.status(500).send('An error occurred while uploading the images');
    }
  })

  // POST store image urls and public ids in db /////////////////////////////////
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

  // DELETE image from cloudinary /////////////////////////////////
  .post('/delete', upload.none(), async (req, res) => {
    const public_id = req.body.public_id;

    if (!public_id) {
      res.status(400).json({ error: 'Public ID is required' });
      return;
    }

    try {
      const result = await cloudinary.uploader.destroy(public_id, 'image');

      if (result && result.result === 'ok') {
        res.status(200).json({ message: 'Image deleted successfully' });
      } else {
        res.status(418).json({
          error:
            'Actually a 500 error, a little levity never hurt but your query did: Failed to delete the image',
        });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  })

  //  gallery post routes ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // GET all gallery posts for user /////////////////////////////////
  .get('/', async (req, res, next) => {
    try {
      const user = await User.getByEmail(req.user.email);

      await user.getGalleryPosts();
      res.json(user.galleryPosts);
    } catch (e) {
      next(e);
    }
  })

  //  POST new gallery post /////////////////////////////////
  .post('/', async (req, res, next) => {
    try {
      const post = await Post.postNewPost(
        req.body.title,
        req.body.description,
        req.body.image_url,
        req.body.category,
        req.body.price,
        req.user.id,
        req.body.public_id,
        req.body.num_imgs
      );
      res.json(post);
    } catch (e) {
      next(e);
    }
  })

  // PUT update gallery post /////////////////////////////////
  .put('/:id', [authDelUp], async (req, res, next) => {
    try {
      const data = await Post.updateById(
        req.body.id,
        req.body.post.title,
        req.body.post.description,
        req.body.post.image_url,
        req.body.post.category,
        req.body.post.price,
        req.body.post.author_id,
        req.body.post.public_id,
        req.body.post.num_imgs,
        req.body.post.discountedPrice,
        req.body.post.price
      );

      res.json(data);
    } catch (e) {
      next(e);
    }
  })

  // DELETE gallery post /////////////////////////////////
  .delete('/:id', [authDelUp], async (req, res) => {
    const data = await Post.deleteById(req.params.id);
    res.json(data);
  })

  // DELETE one gallery image from database /////////////////////////////////
  .delete('/image/:id', [authDelUp], async (req, res, next) => {
    try {
      const data = await Post.deleteImgDataById(
        req.params.id,
        req.body.public_id
      );

      res.json(data);
    } catch (e) {
      next(e);
    }
  })

  // GET gallery post by id ///////////////////////////////////////////
  .get('/:id', [authDelUp], async (req, res, next) => {
    try {
      const data = await Post.getById(req.params.id);
      res.json(data);
    } catch (e) {
      next(e);
    }
  })

  // GET urls for additional images /////////////////////////////////
  .get('/urls/:id', async (req, res, next) => {
    try {
      const data = await Post.getAdditionalImages(req.params.id);
      res.json(data);
    } catch (e) {
      next(e);
    }
  });
