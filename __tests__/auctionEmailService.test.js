const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const Profile = require('../lib/models/Profile');
const { notifyUsersNewAuction } = require('../lib/services/auctionEmailService');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');

jest.mock('../lib/utils/mailer.js', () => ({
  sendNewAuctionEmail: jest.fn().mockResolvedValue(),
}));
const { sendNewAuctionEmail } = require('../lib/utils/mailer.js');

function makeProfileData({
  userId,
  firstName,
  lastName,
  imageUrl = null,
  sendEmailNotifications = true,
}) {
  return { userId, firstName, lastName, imageUrl, sendEmailNotifications };
}

const mockUser = {
  email: 'test@example.com',
  password: '12345',
};

const registerAndLogin = async (userOverrides = {}) => {
  const agent = request.agent(app);
  const userData = { ...mockUser, ...userOverrides };
  const { user } = await UserService.create(userData);
  await agent
    .post('/api/v1/users/sessions')
    .send({ email: userData.email, password: userData.password });
  return [agent, user];
};

describe('auctionEmailService integration', () => {
  beforeEach(async () => {
    await setup(pool);
    jest.clearAllMocks();
  });

  afterAll(() => {
    pool.end();
  });

  it('sends emails to users with notifications enabled and updates timestamp', async () => {
    const [, user] = await registerAndLogin({ email: 'notify1@example.com' });
    await Profile.insert(
      makeProfileData({
        userId: user.id,
        firstName: 'Notify',
        lastName: 'One',
        sendEmailNotifications: true,
      }),
    );

    const auction = { id: 1, title: 'Test Auction' };
    await notifyUsersNewAuction({ auction });

    expect(sendNewAuctionEmail).toHaveBeenCalledWith({ to: 'notify1@example.com', auction });
    const updated = await Profile.getByUserId(user.id);
    expect(updated).toBeTruthy();
    // Check last_auction_email_at updated
    const { rows } = await pool.query(
      'SELECT last_auction_email_at FROM profiles WHERE user_id = $1',
      [user.id],
    );
    expect(rows[0].last_auction_email_at).not.toBeNull();
  });

  it('does not send email if cooldown not passed', async () => {
    const [, user] = await registerAndLogin({ email: 'notify2@example.com' });
    await Profile.insert(
      makeProfileData({
        userId: user.id,
        firstName: 'Notify',
        lastName: 'Two',
        sendEmailNotifications: true,
      }),
    );
    // Set last_auction_email_at to 1 hour ago
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await pool.query('UPDATE profiles SET last_auction_email_at = $2 WHERE user_id = $1', [
      user.id,
      oneHourAgo,
    ]);

    const auction = { id: 2, title: 'Test Auction 2' };
    await notifyUsersNewAuction({ auction });
    expect(sendNewAuctionEmail).not.toHaveBeenCalledWith({ to: 'notify2@example.com', auction });
  });

  it('sends email if cooldown passed', async () => {
    const [, user] = await registerAndLogin({ email: 'notify3@example.com' });
    await Profile.insert(
      makeProfileData({
        userId: user.id,
        firstName: 'Notify',
        lastName: 'Three',
        sendEmailNotifications: true,
      }),
    );
    // Set last_auction_email_at to 3 hours ago
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await pool.query('UPDATE profiles SET last_auction_email_at = $2 WHERE user_id = $1', [
      user.id,
      threeHoursAgo,
    ]);

    const auction = { id: 3, title: 'Test Auction 3' };
    const before = Date.now();
    await notifyUsersNewAuction({ auction });
    const after = Date.now();
    expect(sendNewAuctionEmail).toHaveBeenCalledWith({ to: 'notify3@example.com', auction });
    const { rows } = await pool.query(
      'SELECT last_auction_email_at FROM profiles WHERE user_id = $1',
      [user.id],
    );
    expect(rows[0].last_auction_email_at).not.toBeNull();
    const lastAuctionEmailAt = new Date(rows[0].last_auction_email_at).getTime();
    // Allow a 5 second window for timing issues
    expect(lastAuctionEmailAt).toBeGreaterThanOrEqual(before - 5000);
    expect(lastAuctionEmailAt).toBeLessThanOrEqual(after + 5000);
  });

  it('does not send email to users with notifications disabled', async () => {
    const [, user] = await registerAndLogin({ email: 'notify4@example.com' });

    await Profile.insert(
      makeProfileData({
        userId: user.id,
        firstName: 'No',
        lastName: 'Notify',
        sendEmailNotifications: false,
      }),
    );

    const auction = { id: 4, title: 'Test Auction 4' };
    await notifyUsersNewAuction({ auction });
    expect(sendNewAuctionEmail).not.toHaveBeenCalledWith({ to: 'notify4@example.com', auction });
  });

  it('handles errors gracefully and continues', async () => {
    const [, user] = await registerAndLogin({ email: 'notify5@example.com' });
    await Profile.insert(
      makeProfileData({
        userId: user.id,
        firstName: 'Error',
        lastName: 'Case',
        sendEmailNotifications: true,
      }),
    );
    sendNewAuctionEmail.mockRejectedValueOnce(new Error('fail'));
    const auction = { id: 5, title: 'Test Auction 5' };
    await notifyUsersNewAuction({ auction });

    const { rows } = await pool.query(
      'SELECT last_auction_email_at FROM profiles WHERE user_id = $1',
      [user.id],
    );
    expect(rows[0].last_auction_email_at).toBeNull();
  });
});
