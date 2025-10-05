module.exports = async (req, res, next) => {
  try {
    const allowedEmails = process.env.ALLOWED_EMAILS.split(',');

    if (!req.user || !allowedEmails.includes(req.user.email))
      throw new Error('You do not have access to view this page.');

    next();
  } catch (err) {
    err.status = 403;
    next(err);
  }
};
