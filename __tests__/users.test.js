const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');

const mockUser = {
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  password: '12345',
};

const registerAndLogin = async (userProps = {}) => {
  const userToUse = { ...mockUser, ...userProps };
  const password = userToUse.password;

  // Create an "agent" that gives us the ability
  // to store cookies between requests in a test
  const agent = request.agent(app);

  // Create a user to sign in with
  const user = await UserService.create(userToUse);

  // ...then sign in
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
    const { email } = mockUser;
    expect(res.body).toEqual({
      id: expect.any(String),
      email,
    });
  });

  it('signs in an existing user', async () => {
    await request(app).post('/api/v1/users').send(mockUser);
    const res = await request(app)
      .post('/api/v1/users/sessions')
      .send({ email: 'test@example.com', password: '12345' });
    expect(res.status).toEqual(200);
  });

  it('/protected should return a 401 if not authenticated', async () => {
    const res = await request(app).get('/api/v1/users/protected');
    expect(res.status).toEqual(401);
  });

  it('/protected should return the current user if authenticated', async () => {
    const [agent] = await registerAndLogin();
    const res = await agent.get('/api/v1/users/protected');
    // console.log('res.body', res.body);

    expect(res.status).toEqual(200);
  });

  it('/users should return 401 if email not on the allowed list', async () => {
    const nonAdminUser = {
      email: 'nonadmin@example.com',
      password: 'testpassword',
    };
    const agent = request.agent(app);

    const res = await agent
      .post('/api/v1/users')
      .send(nonAdminUser)
      .catch((err) => err.response);

    expect(res.status).toEqual(401);
    expect(res.body.message).toEqual('Email not allowed');
  });

  it('/users should return 200 if user is admin', async () => {
    const agent = request.agent(app);

    // create a new user
    await agent.post('/api/v1/users').send({
      email: 'admin',
      password: '1234',
      firstName: 'admin',
      lastName: 'admin',
    });
    // sign in the user
    await agent
      .post('/api/v1/users/sessions')
      .send({ email: 'admin', password: '1234' });
    // const [agent] = await registerAndLogin({ email: 'admin' });
    const res = await agent.get('/api/v1/users/');
    expect(res.status).toEqual(200);
  });

  it('/users should return a 200 if user is admin', async () => {
    const [agent] = await registerAndLogin({ email: 'admin' });
    const res = await agent.get('/api/v1/users/');
    expect(res.status).toEqual(200);
  });

  it('DELETE /sessions deletes the user session', async () => {
    const [agent] = await registerAndLogin();
    const resp = await agent.delete('/api/v1/users/sessions');
    expect(resp.status).toBe(204);
  });
});
