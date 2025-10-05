const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const Profile = require('../models/Profile');

module.exports = Router()
  .get('/', authenticate, async (req, res, next) => {
    try {
      const profile = await Profile.getByUserId(req.user.id);
      res.json(profile);
    } catch (e) {
      next(e);
    }
  })

  .put('/', authenticate, async (req, res, next) => {
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
  });
