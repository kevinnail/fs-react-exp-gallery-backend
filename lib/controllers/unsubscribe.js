const { Router } = require('express');
const Profile = require('../models/Profile');
const { MARKETING_CATEGORIES, verifyUnsubscribeToken } = require('../utils/unsubscribeToken');

const router = Router();

// Public on purpose: the opt-out cannot require signing in.
// POST, not GET, so email link scanners opening the link don't unsubscribe anyone.
router.post('/', async (req, res, next) => {
  try {
    const tokenPayload = verifyUnsubscribeToken(req.body.token);
    if (!tokenPayload) {
      return res.status(400).json({ message: 'This unsubscribe link is not valid' });
    }

    const categories = req.body.all === true ? MARKETING_CATEGORIES : [tokenPayload.category];
    const profile = await Profile.unsubscribe(tokenPayload.userId, categories);
    if (!profile) {
      return res.status(404).json({ message: 'Account not found' });
    }

    res.json({ unsubscribedFrom: categories });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
