require('dotenv').config();
const { Router } = require('express'); // This is the Express Router
const authDelUp = require('../middleware/authDelUp');
const User = require('../models/User.js');
const Post = require('../models/Post.js');
const SiteMessage = require('../models/SiteMessage.js');
const multer = require('multer');
const { AsyncParser } = require('@json2csv/node');
const Auction = require('../models/Auction.js');

//# Configure S3 client
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const GalleryPostSale = require('../models/GalleryPostSale.js');
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

module.exports = {
  upload: multer({ storage }),
};

module.exports = Router()
  .get('/download-inventory-csv', async (req, res, next) => {
    try {
      const user = await User.getByEmail(req.user.email);

      // This line will fetch your data from Postgres on Heroku
      const data = await user.getGalleryPosts();

      // Format the created_at dates in the data
      const formattedData = data.map((item) => ({
        ...item,
        created_at: new Date(item.created_at).toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric',
        }),
      }));

      const fields = ['created_at', 'title', 'description', 'image_url', 'category', 'price'];
      const opts = { fields };

      // Create an async parser with your options
      const parser = new AsyncParser(opts);

      // Parse the data
      const csv = await parser.parse(formattedData).promise();

      res.setHeader('Content-Type', 'text/csv');
      res.send(csv);
    } catch (e) {
      next(e);
    }
  })

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
          post.discountedPrice = (parseFloat(post.originalPrice) * discountMultiplier).toString();
        } else if (action === 'undo') {
          post.discountedPrice = post.originalPrice;
        }

        await post.saveBulkEditPost(); // Save the updated post back to the database
      }

      res.status(200).json({ message: 'Discounts applied/removed successfully' });
    } catch (error) {
      console.error('Error applying discounts:', error);
      res.status(500).send('An error occurred while applying discounts');
    }
  })

  .post('/sales', async (req, res, next) => {
    try {
      const { buyerEmail, postId, price, tracking } = req.body;

      if (!buyerEmail || !postId || !price) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      // look up buyer by email
      const buyer = await User.getByEmail(buyerEmail);
      if (!buyer) {
        return res.status(404).json({ message: 'Buyer not found' });
      }

      // create sale record
      const newSale = await GalleryPostSale.createSale({
        postId,
        buyerId: buyer.id,
        price,
        tracking: tracking || null,
      });

      // Emit sale-created websocket event with enriched payload for UI hydration
      if (global.wsService && typeof global.wsService.emitSaleCreated === 'function') {
        const post = await Post.getById(newSale.post_id);
        const payload = {
          type: 'sale',
          saleId: newSale.id,
          postId: newSale.post_id,
          userId: newSale.buyer_id,
          price: newSale.price,
          trackingNumber: newSale.tracking_number,
          isPaid: newSale.is_paid,
          created_at: newSale.created_at,
          post_title: post?.title || null,
          post_image_url: post?.image_url || null,
        };
        console.info('[WS Debug] Emitting sale-created from admin POST /sales', {
          userRoom: `user_${payload.userId}`,
          adminRoom: 'admin_room',
          payload,
        });
        global.wsService.emitSaleCreated(payload);
      }

      return res.status(201).json(newSale);
    } catch (err) {
      next(err);
    }
  })

  //? image routes ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // POST upload image files to S3 /////////////////////////////////
  .post('/upload', upload.array('imageFiles'), async (req, res) => {
    try {
      const uploadPromises = req.files.map((file) => {
        return new Promise((resolve, reject) => {
          const timestamp = Date.now();
          const random1 = Math.random().toString(36).substring(2);
          const random2 = Math.random().toString(36).substring(2);
          const fileName = file.originalname;
          const uniqueId = `${timestamp}_${random1}${random2}_${fileName}`;

          // Define the file path in your S3 bucket
          const key = `stress-less-glass/${uniqueId}`;

          // Wrap async operations in IIFE
          (async () => {
            try {
              const command = new PutObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: key,
                Body: file.buffer,
                ContentType: file.mimetype,
                CacheControl: 'public, max-age=31536000, immutable',
              });

              await s3Client.send(command);

              const result = {
                public_id: uniqueId,
                secure_url: `https://${process.env.CLOUDFRONT_DOMAIN}/${key}`,
                format: file.mimetype.split('/')[1],
                original_filename: file.originalname,
              };

              resolve(result);
            } catch (error) {
              reject(error);
            }
          })();
        });
      });

      // Wait for all uploads to complete concurrently
      const results = await Promise.all(uploadPromises);

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

      const post = await Post.addGalleryImages(post_id, image_urls, image_public_ids);
      res.json(post);
    } catch (e) {
      next(e);
    }
  })

  // DELETE image from S3 /////////////////////////////////
  .post('/delete', upload.none(), async (req, res) => {
    const public_id = req.body.public_id;

    if (!public_id) {
      res.status(400).json({ error: 'Public ID is required' });
      return;
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `stress-less-glass/${public_id}`,
      });

      try {
        await s3Client.send(command);
        res.status(200).json({ message: 'Image deleted successfully' });
      } catch (error) {
        // Check if the error is because the object doesn't exist
        if (error.name === 'NoSuchKey') {
          res.status(200).json({
            message:
              'Image appears to already have been deleted from host. No other error reported- just this fancy message. Proceeding with deletion and then taking over the world.',
          });
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('S3 error:', error);
      res.status(500).json({ error: error.message });
    }
  })

  //?  gallery post routes ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
        req.body.num_imgs,
        req.body.sold,
        req.body.link,
        req.body.hide,
      );
      res.json(post);
    } catch (e) {
      next(e);
    }
  })

  // PUT swap auction to gallery post
  .put('/swap/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      const { type } = req.body;

      // Only allow swap if type is 'auction'
      if (type !== 'auction') {
        return res.status(400).json({ message: 'Invalid swap type' });
      }

      // Find auction by ID
      const auction = await Auction.getById(id);
      if (!auction) {
        return res.status(404).json({ message: 'Auction not found' });
      }

      // Extract image URLs and public IDs
      let imageUrls = [];
      let publicIds = [];
      // If auction.imageUrls is an array, use it; otherwise, fallback to single image_url
      if (Array.isArray(auction.imageUrls) && auction.imageUrls.length > 0) {
        imageUrls = auction.imageUrls;
      } else if (auction.image_url) {
        imageUrls = [auction.image_url];
      }

      // Extract publicIds from imageUrls (everything after last '/')
      publicIds = imageUrls.map((url) => url.substring(url.lastIndexOf('/') + 1));

      // Prepare gallery post data from auction
      const postData = {
        title: auction.title,
        description: auction.description,
        image_url: imageUrls[0] || null,
        category: auction.category,
        price: auction.buyNowPrice || auction.startPrice,
        author_id: auction.creatorId || auction.author_id,
        public_id: publicIds[0] || null,
        num_imgs: imageUrls.length,
        sold: false,
        link: auction.selling_link || auction.link || null,
        hide: false,
      };

      // Create new gallery post
      const newPost = await Post.postNewPost(
        postData.title,
        postData.description,
        postData.image_url,
        postData.category,
        postData.price,
        postData.author_id,
        postData.public_id,
        postData.num_imgs,
        postData.sold,
        postData.link,
        postData.hide,
      );

      // Add additional images to gallery_imgs table
      if (imageUrls.length > 0 && publicIds.length > 0) {
        await Post.addGalleryImages(newPost.id, imageUrls, publicIds);
      }

      // Delete auction and results
      await Auction.deleteAuctionAndResultsById(id);

      res.json({ message: 'Auction swapped to gallery post', post: newPost });
    } catch (e) {
      next(e);
    }
  })

  // PUT update paid/ unpaid /////////////////////////////////
  .put('/sale-pay-status/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      const { isPaid } = req.body;

      if (typeof isPaid !== 'boolean') {
        return res.status(400).json({ error: 'isPaid must be boolean' });
      }

      //   const result = await Auction.markPaid(id, isPaid);
      const result = await GalleryPostSale.updatePaidStatus(id, isPaid);

      // Emit websocket sales-only event (non-auction)
      if (global.wsService && typeof global.wsService.emitSalePaid === 'function') {
        global.wsService.emitSalePaid(result);
      }

      res.json(result);
    } catch (e) {
      next(e);
    }
  })

  // PUT update tracking # /////////////////////////////////
  .put('/:id/tracking', async (req, res, next) => {
    try {
      const { id } = req.params;
      const { trackingNumber } = req.body;

      if (!trackingNumber || typeof trackingNumber !== 'string') {
        return res.status(400).json({ error: 'trackingNumber must be a string' });
      }

      const result = await GalleryPostSale.updateTracking(id, trackingNumber);

      if (global.wsService && typeof global.wsService.emitSaleTrackingInfo === 'function') {
        global.wsService.emitSaleTrackingInfo(result);
      }

      res.json(result);
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
        req.body.post.price,
        req.body.post.sold,
        req.body.post.link,
        req.body.post.hide,
      );

      res.json(data);
    } catch (e) {
      next(e);
    }
  })

  // PATCH soft delete gallery post /////////////////////////////////
  .patch('/delete/:id', [authDelUp], async (req, res, next) => {
    try {
      const data = await Post.softDeleteById(req.params.id);
      if (!data) {
        return res.status(404).json({ error: 'Post not found' });
      }
      res.json(data);
    } catch (e) {
      next(e);
    }
  })

  // DELETE gallery post /////////////////////////////////
  .delete('/:id', [authDelUp], async (req, res, next) => {
    try {
      const data = await Post.deleteById(req.params.id);
      if (!data) {
        return res.status(404).json({ error: 'Post not found' });
      }
      res.json(data);
    } catch (e) {
      next(e);
    }
  })

  // DELETE one gallery image from database /////////////////////////////////
  .delete('/image/:id', [authDelUp], async (req, res, next) => {
    try {
      const data = await Post.deleteImgDataById(req.params.id, req.body.public_id);

      res.json(data);
    } catch (e) {
      next(e);
    }
  })

  // GET ALL admin auctions
  .get('/admin-auctions', async (req, res, next) => {
    try {
      const auctions = await Auction.getAllForAdmin();
      res.json(auctions);
    } catch (e) {
      next(e);
    }
  })

  // GET admin ALL sales
  .get('/sales', async (req, res, next) => {
    try {
      const sales = await GalleryPostSale.getAllSales();

      res.json(sales);
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
  // /
  .get('/urls/:id', async (req, res, next) => {
    try {
      const data = await Post.getAdditionalImages(req.params.id);
      res.json(data);
    } catch (e) {
      next(e);
    }
  });
