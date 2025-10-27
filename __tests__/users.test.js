const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');

jest.mock('../lib/utils/mailer.js', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(),
}));

const mockUser = {
  firstName: 'Test',
  lastName: 'User',
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

  it('GET /me returns user data when authenticated', async () => {
    const [agent, user] = await registerAndLogin();
    const res = await agent.get('/api/v1/users/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: {
        id: user.id,
        email: user.email,
        exp: expect.any(Number),
        iat: expect.any(Number),
      },
      isAdmin: expect.any(Boolean),
    });
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
});
