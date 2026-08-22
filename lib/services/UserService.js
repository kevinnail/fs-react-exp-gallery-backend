const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { validatePassword } = require('../utils/validatePassword');

module.exports = class UserService {
  static async create({ email, password }) {
    validatePassword(password);

    const passwordHash = await bcrypt.hash(password, Number(process.env.SALT_ROUNDS));

    const user = await User.insert({
      email,
      passwordHash,
      is_verified: false,
    });

    const verifyToken = jwt.sign(
      { userId: user.id, verificationTokenVersion: user.verificationTokenVersion },
      process.env.EMAIL_VERIFY_SECRET,
      {
        expiresIn: '15m',
      },
    );

    return { user, verifyToken };
  }

  static async resendVerification({ email }) {
    try {
      const user = await User.getByEmail(email);
      if (!user || user.isVerified) return null;

      const updated = await User.incrementVerifyTokenVersion(user.id);

      const verifyToken = jwt.sign(
        { userId: updated.id, verificationTokenVersion: updated.verificationTokenVersion },
        process.env.EMAIL_VERIFY_SECRET,
        { expiresIn: '15m' },
      );

      return { user: updated, verifyToken };
    } catch (e) {
      // If user not found or other issues, avoid leaking info
      return null;
    }
  }

  static async requestPasswordReset({ email }) {
    try {
      const user = await User.getByEmail(email);
      if (!user) return null;

      // Bumping the version first kills any reset link issued earlier
      const updated = await User.incrementPasswordResetTokenVersion(user.id);

      const resetToken = jwt.sign(
        { userId: updated.id, passwordResetTokenVersion: updated.passwordResetTokenVersion },
        process.env.PASSWORD_RESET_SECRET,
        { expiresIn: '30m' },
      );

      return { user: updated, resetToken };
    } catch (e) {
      // If user not found or other issues, avoid leaking info
      return null;
    }
  }

  static async resetPassword({ token, password }) {
    validatePassword(password);

    let payload;
    try {
      payload = jwt.verify(token, process.env.PASSWORD_RESET_SECRET);
    } catch (error) {
      const isExpired = error.name === 'TokenExpiredError';
      const err = new Error(
        isExpired
          ? 'This password reset link has expired. Request a new one.'
          : 'This password reset link is not valid. Request a new one.',
      );
      err.status = 400;
      err.code = isExpired ? 'RESET_TOKEN_EXPIRED' : 'RESET_TOKEN_INVALID';
      throw err;
    }

    let user;
    try {
      user = await User.getById(payload.userId);
    } catch (error) {
      const err = new Error('This password reset link is not valid. Request a new one.');
      err.status = 400;
      err.code = 'RESET_TOKEN_INVALID';
      throw err;
    }

    // A newer reset request, or an already-completed reset, bumps the version
    // past whatever this token was signed with.
    if (payload.passwordResetTokenVersion !== user.passwordResetTokenVersion) {
      const err = new Error('This password reset link has already been used. Request a new one.');
      err.status = 400;
      err.code = 'RESET_TOKEN_INVALIDATED';
      throw err;
    }

    const passwordHash = await bcrypt.hash(password, Number(process.env.SALT_ROUNDS));

    return User.updatePassword(user.id, passwordHash);
  }

  static async signIn({ email, password = '' }) {
    try {
      const user = await User.getByEmail(email);

      if (!user.isVerified && process.env.NODE_ENV != 'test') {
        const err = new Error('Email not verified');
        err.status = 403;
        err.code = 'EMAIL_NOT_VERIFIED';
        throw err;
      }

      // use built in compareSync method
      if (!bcrypt.compareSync(password, user.passwordHash)) {
        throw new Error('Invalid password');
      }

      // creates our JWT using built in function
      const token = jwt.sign({ ...user }, process.env.JWT_SECRET, {
        expiresIn: '1 day',
      });
      return token;
    } catch (error) {
      error.status = error.status || 401;
      throw error;
    }
  }
};
