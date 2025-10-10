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

describe('csv file download route', () => {
  beforeEach(() => {
    return setup(pool);
  });
  afterAll(() => {
    pool.end();
  });

  it('should download a CSV file', async () => {
    const [agent] = await registerAndLogin();

    // First ensure that the admin endpoint is accessible as before
    const adminPosts = await agent.get('/api/v1/admin');
    expect(adminPosts.status).toBe(200);

    // Now test the CSV download
    const csvResp = await agent
      .get('/api/v1/admin/download-inventory-csv')
      .expect('Content-Type', /csv/)
      .expect(200);

    expect(csvResp.status).toBe(200);
    expect(csvResp.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(csvResp.text).toMatchInlineSnapshot(`
      ""created_at","title","description","image_url","category","price"
      "10/09/2025","Test 1","Test 1","Test 1","Test 1","Test 1"
      "10/09/2025","Test 2","Test 2","Test 2","Test 2","Test 2"
      "10/09/2025","Test 3","Test 3","Test 3","Test 3","Test 3""
    `);
  });
});
