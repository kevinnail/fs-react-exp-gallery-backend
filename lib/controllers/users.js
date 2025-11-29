const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const User = require('../models/User');
const UserService = require('../services/UserService');
const Profile = require('../models/Profile.js');
const Address = require('../models/Address.js');
const { sendVerificationEmail } = require('../utils/mailer.js');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const THIRTY_DAYS_IN_MS = 1000 * 60 * 60 * 24 * 30 * 10;

// Resend verification rate limiter (per-email only)
// Using email-based limiter avoids cross-test IP interference.
const resendEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.body && req.body.email ? String(req.body.email).toLowerCase() : 'no-email',
});

module.exports = Router()
  .post('/', async (req, res, next) => {
    try {
      const { user, verifyToken } = await UserService.create(req.body);

      await sendVerificationEmail(user.email, verifyToken);

      await Profile.insert({ userId: user.id });

      res.json({ message: 'Account created. Check your email to verify your account.' });
    } catch (e) {
      if (e.code === '23505') {
        res.status(400).json({
          message: 'This email is already registered. Please use a different email.',
        });
      } else {
        next(e);
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
      const profiles = await Profile.getAllProfiles();
      const addresses = await Address.getAllAddresses();

      // Create a lookup map for quick access
      const profileMap = new Map(profiles.map((profile) => [profile.userId, profile]));
      // For addresses, prefer the most recent per user
      const addressMap = new Map();
      for (const addr of addresses) {
        const existing = addressMap.get(addr.userId);
        if (!existing) {
          addressMap.set(addr.userId, addr);
        } else {
          const existingTs = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
          const currentTs = addr.createdAt ? new Date(addr.createdAt).getTime() : 0;
          if (currentTs >= existingTs) addressMap.set(addr.userId, addr);
        }
      }

      // Merge matching profiles into each user
      const merged = users.map((u) => ({
        ...u,
        profile: profileMap.get(u.id) || null,
        address: addressMap.get(u.id) || null,
      }));
      res.json(merged);
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
  })

  .get('/verify', async (req, res) => {
    const { token } = req.query;

    try {
      const payload = jwt.verify(token, process.env.EMAIL_VERIFY_SECRET);
      const user = await User.getById(payload.userId);

      if (!user) {
        return res.redirect(
          `${process.env.FRONTEND_URL}/auth/sign-in?verify=false&code=USER_NOT_FOUND`,
        );
      }

      if (payload.verificationTokenVersion !== user.verificationTokenVersion) {
        return res.redirect(
          `${process.env.FRONTEND_URL}/auth/sign-in?verify=false&code=TOKEN_INVALIDATED`,
        );
      }

      await User.verifyUser(payload.userId);

      res.redirect(`${process.env.FRONTEND_URL}/auth/sign-in?verify=true`);
    } catch (err) {
      if (err && err.name === 'TokenExpiredError') {
        return res.redirect(
          `${process.env.FRONTEND_URL}/auth/sign-in?verify=false&code=TOKEN_EXPIRED`,
        );
      }
      console.error('Email verification error:', err);
      res.redirect(`${process.env.FRONTEND_URL}/auth/sign-in?verify=false`);
    }
  })

  .post('/resend-verification', [resendEmailLimiter], async (req, res, next) => {
    try {
      const { email } = req.body || {};
      const result = await UserService.resendVerification({ email });

      if (result && result.verifyToken) {
        try {
          await sendVerificationEmail(result.user.email, result.verifyToken);
        } catch (mailErr) {
          // Log but do not leak info
          console.error('Resend verification email error:', mailErr);
        }
      }

      return res.json({
        message: 'If an account exists, a new verification email has been sent.',
      });
    } catch (err) {
      next(err);
    }
  });
