const Post = require('../models/Post.js');

module.exports = async (req, res, next) => {
  try {
    const post = await Post.getById(req.params.id);

    // if (post && (req.user.email === 'admin' || post.user_id === req.user.id)) {
    if (
      post &&
      (req.user.email === 'admin' || post.author_id === req.user.id)
    ) {
      // if (post && (req.user.email === 'admin' || 'test@example.com')) {
      next();
    } else {
      throw new Error('You do not have access to this page');
    }
  } catch (e) {
    e.status = 403;
    next(e);
  }
};
