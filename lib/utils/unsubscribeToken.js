const jwt = require('jsonwebtoken');

// The marketing categories an email can carry an unsubscribe link for
const MARKETING_CATEGORIES = ['auctions', 'galleryPosts', 'promotions'];

const getSecret = () => {
  if (!process.env.UNSUBSCRIBE_SECRET) {
    throw new Error('UNSUBSCRIBE_SECRET environment variable is required');
  }
  return process.env.UNSUBSCRIBE_SECRET;
};

// No expiry: the opt-out link has to keep working long after the email was sent
const buildUnsubscribeUrl = (userId, category) => {
  if (!MARKETING_CATEGORIES.includes(category)) {
    throw new Error(`Unknown unsubscribe category: ${category}`);
  }
  const token = jwt.sign({ userId: String(userId), category }, getSecret());
  return `${process.env.FRONTEND_URL}/unsubscribe?token=${token}`;
};

// Returns { userId, category }, or null when the token is not one we signed
const verifyUnsubscribeToken = (token) => {
  let payload;
  try {
    payload = jwt.verify(token, getSecret());
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) return null;
    throw error;
  }
  if (!MARKETING_CATEGORIES.includes(payload.category)) return null;
  return { userId: payload.userId, category: payload.category };
};

module.exports = { MARKETING_CATEGORIES, buildUnsubscribeUrl, verifyUnsubscribeToken };
