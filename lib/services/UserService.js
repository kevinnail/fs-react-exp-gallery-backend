const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = class UserService {
  static async create({ email, password }) {
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
