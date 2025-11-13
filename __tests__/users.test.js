const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');
const User = require('../lib/models/User.js');
const { sendVerificationEmail } = require('../lib/utils/mailer.js');

jest.mock('../lib/utils/mailer.js', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(),
}));

const mockUser = {
  email: 'test@example.com',
  password: '12345',
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
      .send({ email: 'test@example.com', password: '12345' });
    expect(res.status).toEqual(200);
  });

  it('/users should return 200 if user is admin', async () => {
    const agent = request.agent(app);

    // create a new user
    await agent.post('/api/v1/users').send({
      email: process.env.ALLOWED_EMAILS.split(',')[0],
      password: '1234',
      firstName: 'admin',
      lastName: 'admin',
    });
    // sign in the user
    await agent
      .post('/api/v1/users/sessions')
      .send({ email: process.env.ALLOWED_EMAILS.split(',')[0], password: '1234' });
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
    const mockUser = { email: 'testverify@example.com', password: '12345' };
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
});
