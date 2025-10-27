const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = class UserService {
  static async create({ email, password }) {
    const passwordHash = await bcrypt.hash(password, Number(process.env.SALT_ROUNDS));

    const user = await User.insert({
      email,
      passwordHash,
      is_verified: process.env.NODE_ENV === 'test', // auto-verify during tests
    });

    const verifyToken = jwt.sign({ userId: user.id }, process.env.EMAIL_VERIFY_SECRET, {
      expiresIn: '15m',
    });

    return { user, verifyToken };
  }

  static async signIn({ email, password = '' }) {
    try {
      const user = await User.getByEmail(email);

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
      error.status = 401;
      throw error;
    }
  }
};
