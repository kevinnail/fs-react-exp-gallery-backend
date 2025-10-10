require('dotenv').config();
const { Router } = require('express');
const Profile = require('../models/Profile');

const multer = require('multer');

//# Configure S3 client
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

const router = Router();

router
  //? Data routes
  .get('/', async (req, res, next) => {
    try {
      const profile = await Profile.getByUserId(req.user.id);
      res.json(profile);
    } catch (e) {
      next(e);
    }
  })

  .get('/admin-profile', async (req, res, next) => {
    try {
      const profile = await Profile.getByUserId(1);
      const adminProfile = {
        id: profile.id,
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        imageUrl: profile.imageUrl,
      };
      res.json(adminProfile);
    } catch (e) {
      next(e);
    }
  })

  .put('/', async (req, res, next) => {
    try {
      const { firstName, lastName, imageUrl } = req.body;
      const profile = await Profile.upsertByUserId(req.user.id, {
        firstName,
        lastName,
        imageUrl,
      });
      res.json(profile);
    } catch (e) {
      next(e);
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
          const key = `stress-less-glass-profile-images/${uniqueId}`;

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

  // POST update profile image URL /////////////////////////////////
  .post('/images', upload.none(), async (req, res, next) => {
    try {
      const image_url = req.body.image_url;

      // Retrieve existing image URL from DB and delete from S3 if present
      try {
        const existingProfile = await Profile.getByUserId(req.user.id);
        const previousUrl =
          existingProfile && existingProfile.imageUrl ? existingProfile.imageUrl : null;

        if (previousUrl && previousUrl !== image_url) {
          let keyFromUrl = null;
          try {
            const parsed = new URL(previousUrl);
            keyFromUrl = parsed.pathname.startsWith('/')
              ? parsed.pathname.slice(1)
              : parsed.pathname;
          } catch (_) {
            keyFromUrl = null;
          }

          if (keyFromUrl) {
            const deleteCommand = new DeleteObjectCommand({
              Bucket: process.env.AWS_BUCKET_NAME,
              Key: keyFromUrl,
            });

            try {
              await s3Client.send(deleteCommand);
            } catch (error) {
              if (error && error.name !== 'NoSuchKey') throw error;
            }
          }
        }
      } catch (deletionError) {
        return next(deletionError);
      }

      const profile = await Profile.upsertByUserId(req.user.id, {
        firstName: req.body.firstName || null,
        lastName: req.body.lastName || null,
        imageUrl: image_url,
      });
      res.json(profile);
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
  });

module.exports = {
  router,
  upload,
};
