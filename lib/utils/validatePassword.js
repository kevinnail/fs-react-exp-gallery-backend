/*
 * Mirrors the client-side rule in the frontend's Auth.js so the API cannot be used
 * to set a password the UI would have rejected. At least 8 characters with one
 * lowercase, one uppercase, one digit, and one symbol.
 */
const STRONG_PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;

const WEAK_PASSWORD_MESSAGE =
  'Password must be at least 8 characters long and include uppercase, lowercase, number, and symbol';

const validatePassword = (password) => {
  if (typeof password !== 'string' || !STRONG_PASSWORD_PATTERN.test(password)) {
    const error = new Error(WEAK_PASSWORD_MESSAGE);
    error.status = 400;
    error.code = 'WEAK_PASSWORD';
    throw error;
  }
};

module.exports = { validatePassword, STRONG_PASSWORD_PATTERN, WEAK_PASSWORD_MESSAGE };
