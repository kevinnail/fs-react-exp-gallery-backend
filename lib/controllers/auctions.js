const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize.js');
const Auction = require('../models/Auction.js');

const multer = require('multer');

//# Configure S3 client
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const Bid = require('../models/Bid.js');
const { scheduleAuctionEnd } = require('../jobs/auctionTimers.js');
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

module.exports = Router()
  .get('/', async (req, res, next) => {
    try {
      const auctions = await Auction.getAllActive();
      res.json(auctions);
    } catch (e) {
      next(e);
    }
  })

  // GET auction by id ///////////////////////////////////////////
  .get('/:id', [authenticate], async (req, res, next) => {
    try {
      const data = await Auction.getById(req.params.id);
      res.json(data);
    } catch (e) {
      next(e);
    }
  })

  .get('/user-auctions/:id', async (req, res, next) => {
    try {
      const userId = req.params.id;
      const activeAuctionBids = await Bid.getByUserId(userId);
      const wonAuctions = await Auction.getUserAuctionWins(userId);
      res.json({ activeAuctionBids, wonAuctions });
    } catch (e) {
      next(e);
    }
  })

  //? image route ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
          const key = `stress-less-glass-auction-images/${uniqueId}`;

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

  // POST new auction
  .post('/', [authenticate, authorize], async (req, res, next) => {
    try {
      const { auctionDetails } = req.body;

      if (!auctionDetails) {
        return res.status(400).json({ error: 'Message content is required' });
      }

      const auction = await Auction.insert(auctionDetails);

      scheduleAuctionEnd(auction.id, auction.endTime);

      // Emit WebSocket event for real-time updates
      // if (global.wsService) {
      //   global.wsService.emitBIN(auction, auction.id);
      // }

      res.json(auction);
    } catch (e) {
      next(e);
    }
  })

  // PUT update auction /////////////////////////////////
  .put('/:id', [authenticate, authorize], async (req, res, next) => {
    try {
      const id = req.body.id;
      const updatedAuction = req.body.auction;

      // 1. Fetch the existing auction from DB
      const existingAuction = await Auction.getById(id);
      if (!existingAuction) {
        return res.status(404).json({ message: 'Auction not found' });
      }

      // 2. Determine which URLs need to be deleted
      const oldUrls = existingAuction.imageUrls || [];
      const newUrls = updatedAuction.imageUrls || [];
      const toDelete = oldUrls.filter((url) => !newUrls.includes(url));

      // 3. Loop over each URL to delete from S3
      for (const url of toDelete) {
        try {
          const parsed = new URL(url);
          const keyFromUrl = parsed.pathname.startsWith('/')
            ? parsed.pathname.slice(1)
            : parsed.pathname;

          if (keyFromUrl) {
            const deleteCommand = new DeleteObjectCommand({
              Bucket: process.env.AWS_BUCKET_NAME,
              Key: keyFromUrl,
            });

            try {
              await s3Client.send(deleteCommand);
            } catch (error) {
              if (error.name !== 'NoSuchKey') throw error;
              console.error(`S3 delete skipped (NoSuchKey): ${keyFromUrl}`);
            }
          }
        } catch (err) {
          console.error('Error parsing URL for deletion:', url, err);
        }
      }

      // 4. Prepare update fields
      const fields = {
        title: updatedAuction.title,
        description: updatedAuction.description,
        imageUrls: newUrls,
        startPrice: updatedAuction.startPrice,
        buyNowPrice: updatedAuction.buyNowPrice,
        currentBid: updatedAuction.currentBid,
        startTime: updatedAuction.startTime,
        endTime: updatedAuction.endTime,
        isActive: updatedAuction.isActive,
      };

      // 5. Update auction record in DB
      const data = await Auction.updateById(id, fields);

      // 6. Respond
      res.json(data);
    } catch (e) {
      next(e);
    }
  });
