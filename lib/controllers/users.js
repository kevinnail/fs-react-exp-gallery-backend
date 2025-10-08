const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const User = require('../models/User');
const UserService = require('../services/UserService');

const THIRTY_DAYS_IN_MS = 1000 * 60 * 60 * 24 * 30 * 10;

// testing
module.exports = Router()
  .post('/', async (req, res, next) => {
    try {
      const user = await UserService.create(req.body);
      res.json(user);
    } catch (e) {
      if (e.code === '23505') {
        // PostgreSQL error code for unique violation
        res.status(400).json({
          message: 'This email is already registered. Please use a different email.',
        });
      } else {
        next(e); // Pass other errors to the error-handling middleware
      }
    }
  })
  .post('/sessions', async (req, res, next) => {
    try {
      const token = await UserService.signIn(req.body);

      const testOption = process.env.SECURE_COOKIES === 'true';
      const secureOption = process.env.SECURE_COOKIES === 'true' ? 'true' : 'false';

      res
        .cookie(process.env.COOKIE_NAME, token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'test' ? testOption : secureOption,
          sameSite: 'none',
          maxAge: THIRTY_DAYS_IN_MS,
        })
        .json({ message: 'Signed in successfully!' });
    } catch (e) {
      next(e);
    }
  })

  .get('/me', authenticate, async (req, res) => {
    res.json({ user: req.user, isAdmin: req.isAdmin });
  })

  .get('/', [authenticate, authorize], async (req, res, next) => {
    try {
      const users = await User.getAll();
      res.json(users);
    } catch (e) {
      next(e);
    }
  })

  .delete('/sessions', (req, res) => {
    const testOption = process.env.SECURE_COOKIES === 'true';
    const secureOption = process.env.SECURE_COOKIES === 'true' ? 'true' : 'false';

    res
      .clearCookie(process.env.COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'test' ? testOption : secureOption,
        sameSite: 'none',
        maxAge: THIRTY_DAYS_IN_MS,
      })
      .status(204)
      .send();
  });
