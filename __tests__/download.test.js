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
    const adminResp = await agent.get('/api/v1/admin');
    expect(adminResp.status).toBe(200);

    // Now test the CSV download
    const csvResp = await agent
      .get('/api/v1/admin/download-inventory-csv')
      .expect('Content-Type', /csv/)
      .expect(200);

    // Check if the Content-Disposition header is set correctly for file download
    expect(csvResp.headers['content-disposition']).toBe(
      'attachment; filename=inventory.csv'
    );

    // Ensure that the CSV has the expected header structure. You can expand this to verify the data as well.
    expect(csvResp.text).toContain(
      '"created_at","title","description","category","price'
    ); // Update this line if needed based on your CSV structure
  });
});
