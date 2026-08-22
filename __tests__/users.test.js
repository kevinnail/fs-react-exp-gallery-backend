const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');
const User = require('../lib/models/User.js');
const jwt = require('jsonwebtoken');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../lib/utils/mailer.js');

jest.mock('../lib/utils/mailer.js', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(),
}));

const mockUser = {
  email: 'test@example.com',
  password: 'Test1234!',
};

const registerAndLogin = async (userProps = {}) => {
  const userToUse = { ...mockUser, ...userProps };
  const password = userToUse.password;
  const agent = request.agent(app);

  const { user } = await UserService.create(userToUse); // destructure new return shape

  const { email } = user;
  await agent.post('/api/v1/users/sessions').send({ email, password });
  return [agent, user];
};

describe('user routes', () => {
  beforeEach(() => {
    return setup(pool);
  });
  afterAll(() => {
    pool.end();
  });

  it('creates a new user', async () => {
    const res = await request(app).post('/api/v1/users').send(mockUser);
    expect(res.body).toEqual({
      message: 'Account created. Check your email to verify your account.',
    });

    expect(sendVerificationEmail).toHaveBeenCalled();
  });

  it('signs in an existing user', async () => {
    await request(app).post('/api/v1/users').send(mockUser);
    const res = await request(app)
      .post('/api/v1/users/sessions')
      .send({ email: 'test@example.com', password: 'Test1234!' });
    expect(res.status).toEqual(200);
  });

  it('/users should return 200 if user is admin', async () => {
    const agent = request.agent(app);

    // create a new user
    await agent.post('/api/v1/users').send({
      email: process.env.ALLOWED_EMAILS.split(',')[0],
      password: 'Test1234!',
      firstName: 'admin',
      lastName: 'admin',
    });
    // sign in the user
    await agent
      .post('/api/v1/users/sessions')
      .send({ email: process.env.ALLOWED_EMAILS.split(',')[0], password: 'Test1234!' });
    const res = await agent.get('/api/v1/users/');
    expect(res.status).toEqual(200);
  });

  it('/users should return a 200 if user is admin', async () => {
    const [agent] = await registerAndLogin({ email: process.env.ALLOWED_EMAILS.split(',')[0] });
    const res = await agent.get('/api/v1/users/');
    expect(res.status).toEqual(200);
  });

  it('DELETE /sessions deletes the user session', async () => {
    const [agent] = await registerAndLogin();
    const resp = await agent.delete('/api/v1/users/sessions');
    expect(resp.status).toBe(204);
  });

  it('verifies a user and allows them to access /me', async () => {
    // Step 1 - Create an unverified user (directly through the service)
    const mockUser = { email: 'testverify@example.com', password: 'Test1234!' };
    const { verifyToken } = await UserService.create(mockUser);

    // Step 2 - Simulate clicking the verification link
    const verifyRes = await request(app).get(`/api/v1/users/verify?token=${verifyToken}`);

    expect(verifyRes.status).toBe(302);

    // Step 3 - Login after verification using a fresh agent to hold cookies
    const agent = request.agent(app);
    const loginRes = await agent.post('/api/v1/users/sessions').send({
      email: mockUser.email,
      password: mockUser.password,
    });
    expect(loginRes.status).toBe(200);

    // Step 4 - Now check /me
    const meRes = await agent.get('/api/v1/users/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(mockUser.email);
    expect(meRes.body.user.isVerified).toBe(true);
  });

  it('GET /me returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
  });

  it('GET /users returns 403 when user is not admin', async () => {
    const [agent] = await registerAndLogin({ email: 'regular@example.com' });
    const res = await agent.get('/api/v1/users/');
    expect(res.status).toBe(403);
  });

  it('verifies a user when the token is valid', async () => {
    const { user, verifyToken } = await UserService.create(mockUser);
    const unverifiedUser = await User.getByEmail(user.email);
    expect(unverifiedUser.isVerified).toBe(false);

    // simulate clicking the verification link
    const res = await request(app).get(`/api/v1/users/verify?token=${verifyToken}`);

    expect(res.status).toBe(302); // redirect
    const verifiedUser = await User.getByEmail(user.email);
    expect(verifiedUser.isVerified).toBe(true);
  });

  it('returns 403 with EMAIL_NOT_VERIFIED code when signing in before verification (non-test env)', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const uniqueEmail = 'unverified-flow@example.com';
    const { user } = await UserService.create({ email: uniqueEmail, password: 'Test1234!' });
    expect(user.isVerified).toBe(false);
    const res = await request(app)
      .post('/api/v1/users/sessions')
      .send({ email: uniqueEmail, password: 'Test1234!' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('increments verification token version and invalidates old token after resend', async () => {
    const email = 'resend1@example.com';
    const { verifyToken } = await UserService.create({ email, password: 'Test1234!' });
    const firstUser = await User.getByEmail(email);
    expect(firstUser.verificationTokenVersion).toBe(1);

    // Resend via service to get new token (increments version)
    const { verifyToken: newToken } = await UserService.resendVerification({ email });
    const updatedUser = await User.getByEmail(email);
    expect(updatedUser.verificationTokenVersion).toBe(2);

    // Old token should now be invalidated
    const oldRes = await request(app).get(`/api/v1/users/verify?token=${verifyToken}`);
    expect(oldRes.status).toBe(302);
    expect(oldRes.headers.location).toContain('verify=false');
    expect(oldRes.headers.location).toContain('TOKEN_INVALIDATED');

    // New token should work
    const newRes = await request(app).get(`/api/v1/users/verify?token=${newToken}`);
    expect(newRes.status).toBe(302);
    expect(newRes.headers.location).toContain('verify=true');
  });

  it('resend verification route increments version but returns generic message', async () => {
    const email = 'resend2@example.com';
    await UserService.create({ email, password: 'Test1234!' });
    const before = await User.getByEmail(email);
    expect(before.verificationTokenVersion).toBe(1);
    const res = await request(app).post('/api/v1/users/resend-verification').send({ email });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/If an account exists/i);
    const after = await User.getByEmail(email);
    expect(after.verificationTokenVersion).toBe(2);
  });

  it('rate limits resend verification after 3 attempts (per-email only)', async () => {
    const email = 'ratelimit@example.com';
    for (let i = 0; i < 3; i++) {
      const r = await request(app).post('/api/v1/users/resend-verification').send({ email });
      expect(r.status).toBe(200);
    }
    const fourth = await request(app).post('/api/v1/users/resend-verification').send({ email });
    expect(fourth.status).toBe(429);
  });

  it('forgot password sends a reset email and bumps the reset token version', async () => {
    sendPasswordResetEmail.mockClear();
    const email = 'forgot1@example.com';
    await UserService.create({ email, password: 'Test1234!' });

    const before = await User.getByEmail(email);
    expect(before.passwordResetTokenVersion).toBe(1);

    const res = await request(app).post('/api/v1/users/forgot-password').send({ email });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('If an account exists, a password reset email has been sent.');

    const after = await User.getByEmail(email);

    expect(after.passwordResetTokenVersion).toBe(2);

    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const [recipient, resetToken] = sendPasswordResetEmail.mock.calls[0];
    expect(recipient).toBe(email);

    // The token has to carry the bumped version, otherwise the reset step cannot
    // tell a fresh link from a superseded one.
    const payload = jwt.verify(resetToken, process.env.PASSWORD_RESET_SECRET);
    expect(payload.userId).toBe(after.id);
    expect(payload.passwordResetTokenVersion).toBe(2);
  });

  it('forgot password does not leak whether an account exists', async () => {
    sendPasswordResetEmail.mockClear();
    const knownEmail = 'forgot2@example.com';
    await UserService.create({ email: knownEmail, password: 'Test1234!' });

    const known = await request(app).post('/api/v1/users/forgot-password').send({
      email: knownEmail,
    });
    const unknown = await request(app).post('/api/v1/users/forgot-password').send({
      email: 'nobody-here@example.com',
    });

    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);

    // Only the real account triggers mail
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail.mock.calls[0][0]).toBe(knownEmail);
  });

  it('rate limits forgot password after 3 attempts (per-email only)', async () => {
    const email = 'forgot-ratelimit@example.com';
    await UserService.create({ email, password: 'Test1234!' });

    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await request(app).post('/api/v1/users/forgot-password').send({ email });
      expect(response.status).toBe(200);
    }

    const fourth = await request(app).post('/api/v1/users/forgot-password').send({ email });
    expect(fourth.status).toBe(429);
  });

  it('resets the password, then the new one works and the old one does not', async () => {
    const email = 'reset-golden@example.com';
    const originalPassword = 'Test1234!';
    const newPassword = 'BrandNew5$';
    await UserService.create({ email, password: originalPassword });

    const { resetToken } = await UserService.requestPasswordReset({ email });

    const res = await request(app)
      .post('/api/v1/users/reset-password')
      .send({ token: resetToken, password: newPassword });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Your password has been reset. You can now sign in.');

    const withNewPassword = await request(app)
      .post('/api/v1/users/sessions')
      .send({ email, password: newPassword });
    expect(withNewPassword.status).toBe(200);
    expect(withNewPassword.headers['set-cookie']).toBeDefined();

    const withOldPassword = await request(app)
      .post('/api/v1/users/sessions')
      .send({ email, password: originalPassword });
    expect(withOldPassword.status).toBe(401);
  });

  it('rejects a reset token that has already been used', async () => {
    const email = 'reset-reuse@example.com';
    await UserService.create({ email, password: 'Test1234!' });

    const { resetToken } = await UserService.requestPasswordReset({ email });

    const first = await request(app)
      .post('/api/v1/users/reset-password')
      .send({ token: resetToken, password: 'FirstPass1$' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/v1/users/reset-password')
      .send({ token: resetToken, password: 'SecondPass2$' });
    expect(second.status).toBe(400);
    expect(second.body.code).toBe('RESET_TOKEN_INVALIDATED');

    // The second attempt must not have taken effect
    const signIn = await request(app)
      .post('/api/v1/users/sessions')
      .send({ email, password: 'SecondPass2$' });
    expect(signIn.status).toBe(401);
  });

  it('rejects a weak new password and leaves the stored hash alone', async () => {
    const email = 'reset-weak@example.com';
    await UserService.create({ email, password: 'Test1234!' });
    const before = await User.getByEmail(email);

    const { resetToken } = await UserService.requestPasswordReset({ email });

    const res = await request(app)
      .post('/api/v1/users/reset-password')
      .send({ token: resetToken, password: 'weakpass' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WEAK_PASSWORD');

    const after = await User.getByEmail(email);
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it('rejects a token signed with the email verification secret', async () => {
    const email = 'reset-wrong-secret@example.com';
    const { user } = await UserService.create({ email, password: 'Test1234!' });

    const forgedToken = jwt.sign(
      { userId: user.id, passwordResetTokenVersion: 1 },
      process.env.EMAIL_VERIFY_SECRET,
      { expiresIn: '30m' },
    );

    const res = await request(app)
      .post('/api/v1/users/reset-password')
      .send({ token: forgedToken, password: 'BrandNew5$' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RESET_TOKEN_INVALID');
  });

  it('rejects a weak password at signup', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .send({ email: 'weak-signup@example.com', password: 'password' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WEAK_PASSWORD');
  });
});
