const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const Profile = require('../lib/models/Profile');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');

jest.mock('../lib/utils/mailer.js', () => ({
  sendMassEmail: jest.fn().mockResolvedValue(),
}));
const { sendMassEmail } = require('../lib/utils/mailer.js');

// test@example.com is configured as an admin (in ALLOWED_EMAILS) for the test env
const adminUser = { email: 'test@example.com', password: '12345' };

const registerAndLogin = async (userOverrides = {}) => {
  const agent = request.agent(app);
  const userData = { ...adminUser, ...userOverrides };
  const { user } = await UserService.create(userData);
  await agent
    .post('/api/v1/users/sessions')
    .send({ email: userData.email, password: userData.password });
  return [agent, user];
};

describe('POST /api/v1/admin/mass-email', () => {
  beforeEach(async () => {
    await setup(pool);
    jest.clearAllMocks();
  });

  afterAll(() => {
    pool.end();
  });

  it('sends to opted-in customers and returns counts for an admin', async () => {
    const [adminAgent] = await registerAndLogin();
    const { user: recipient } = await UserService.create({
      email: 'optin@example.com',
      password: '12345',
    });
    await Profile.insert({
      userId: recipient.id,
      firstName: 'Opt',
      lastName: 'In',
      imageUrl: null,
      sendEmailNotifications: true,
    });

    const resp = await adminAgent
      .post('/api/v1/admin/mass-email')
      .send({ subject: 'Sorry!', message: 'Please disregard the earlier email.' });

    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({ total: 1, sent: 1, failed: 0 });
    expect(sendMassEmail).toHaveBeenCalledWith({
      to: 'optin@example.com',
      subject: 'Sorry!',
      message: 'Please disregard the earlier email.',
    });
  });

  it('returns 400 when subject is missing', async () => {
    const [adminAgent] = await registerAndLogin();
    const resp = await adminAgent.post('/api/v1/admin/mass-email').send({ message: 'Body only' });
    expect(resp.status).toBe(400);
    expect(sendMassEmail).not.toHaveBeenCalled();
  });

  it('returns 400 when message is blank', async () => {
    const [adminAgent] = await registerAndLogin();
    const resp = await adminAgent
      .post('/api/v1/admin/mass-email')
      .send({ subject: 'Hello', message: '   ' });
    expect(resp.status).toBe(400);
    expect(sendMassEmail).not.toHaveBeenCalled();
  });

  it('returns 403 for an authenticated non-admin user', async () => {
    const [userAgent] = await registerAndLogin({ email: 'regular@example.com' });
    const resp = await userAgent
      .post('/api/v1/admin/mass-email')
      .send({ subject: 'Hi', message: 'Body' });
    expect(resp.status).toBe(403);
    expect(sendMassEmail).not.toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    const resp = await request(app)
      .post('/api/v1/admin/mass-email')
      .send({ subject: 'Hi', message: 'Body' });
    expect(resp.status).toBe(401);
    expect(sendMassEmail).not.toHaveBeenCalled();
  });
});
