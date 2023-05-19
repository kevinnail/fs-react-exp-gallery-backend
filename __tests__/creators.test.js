const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');

// Dummy user for testing
const mockUser = {
  email: 'test@example.com',
  password: '12345',
};

const registerAndLogin = async (userProps = {}) => {
  const password = userProps.password ?? mockUser.password;

  // Create an "agent" that gives us the ability
  // to store cookies between requests in a test
  const agent = request.agent(app);

  // Create a user to sign in with
  const user = await UserService.create({ ...mockUser, ...userProps });

  // ...then sign in
  const { email } = user;
  await agent.post('/api/v1/users/sessions').send({ email, password });
  return [agent, user];
};

describe('creators routes', () => {
  beforeEach(() => {
    return setup(pool);
  });
  afterAll(() => {
    pool.end();
  });

  it('GET /api/v1/creators should return a list of creators', async () => {
    const resp = await request(app).get('/api/v1/creators');
    expect(resp.status).toBe(200);
    expect(resp.body).toMatchInlineSnapshot(`
      Array [
        Object {
          "artist_name": "Brutus",
          "email": "Brutus@gmail.com",
          "first_name": "Jeff",
          "id": "1",
          "last_name": "Stevens",
        },
        Object {
          "artist_name": "Highly Educated",
          "email": "Highlyeducated@gmail.com",
          "first_name": "Bob",
          "id": "2",
          "last_name": "Ross",
        },
      ]
    `);
  });
});
