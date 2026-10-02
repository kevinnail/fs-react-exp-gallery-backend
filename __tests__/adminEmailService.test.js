const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const Profile = require('../lib/models/Profile');
const { sendMassEmailToCustomers } = require('../lib/services/adminEmailService');
const UserService = require('../lib/services/UserService');

jest.mock('../lib/utils/mailer.js', () => ({
  sendMassEmail: jest.fn().mockResolvedValue(),
}));
const { sendMassEmail } = require('../lib/utils/mailer.js');

function makeProfileData({ userId, firstName, lastName, imageUrl = null, ...emailPreferences }) {
  return { userId, firstName, lastName, imageUrl, ...emailPreferences };
}

const createUserWithProfile = async ({ email, ...emailPreferences }) => {
  const { user } = await UserService.create({ email, password: 'Test1234!' });
  await Profile.insert(
    makeProfileData({
      userId: user.id,
      firstName: 'Test',
      lastName: 'User',
      ...emailPreferences,
    }),
  );
  return user;
};

describe('adminEmailService integration', () => {
  beforeEach(async () => {
    await setup(pool);
    jest.clearAllMocks();
  });

  afterAll(() => {
    pool.end();
  });

  it('sends an announcement to every customer, including opted-out ones', async () => {
    await createUserWithProfile({ email: 'optin@example.com' });
    await createUserWithProfile({
      email: 'optout@example.com',
      emailAuctions: false,
      emailGalleryPosts: false,
      emailPromotions: false,
    });

    const result = await sendMassEmailToCustomers({
      subject: 'Site update',
      message: 'Your order history is now on your account page.',
    });

    expect(sendMassEmail).toHaveBeenCalledTimes(2);
    expect(sendMassEmail).toHaveBeenCalledWith({
      to: 'optin@example.com',
      subject: 'Site update',
      message: 'Your order history is now on your account page.',
    });
    expect(sendMassEmail).toHaveBeenCalledWith({
      to: 'optout@example.com',
      subject: 'Site update',
      message: 'Your order history is now on your account page.',
    });
    expect(result).toEqual({ total: 2, sent: 2, failed: 0 });
  });

  it('sends a promotion only to targeted customers with promotion emails on', async () => {
    const promotionsOn = await createUserWithProfile({
      email: 'promotions-on@example.com',
      emailAuctions: false,
      emailGalleryPosts: false,
    });
    const promotionsOff = await createUserWithProfile({
      email: 'promotions-off@example.com',
      emailPromotions: false,
    });

    const result = await sendMassEmailToCustomers({
      subject: 'Sale',
      message: 'Everything is 20% off this weekend.',
      userIds: [Number(promotionsOn.id), Number(promotionsOff.id)],
    });

    expect(sendMassEmail).toHaveBeenCalledTimes(1);
    expect(sendMassEmail).toHaveBeenCalledWith({
      to: 'promotions-on@example.com',
      subject: 'Sale',
      message: 'Everything is 20% off this weekend.',
    });
    expect(result).toEqual({ total: 1, sent: 1, failed: 0 });
  });

  it('counts a failed send and still emails the remaining recipients', async () => {
    await createUserWithProfile({ email: 'first@example.com' });
    await createUserWithProfile({ email: 'second@example.com' });

    // first recipient's send blows up; the loop must continue to the second
    sendMassEmail.mockRejectedValueOnce(new Error('smtp fail'));

    const result = await sendMassEmailToCustomers({ subject: 'Hi', message: 'Body' });

    expect(sendMassEmail).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ total: 2, sent: 1, failed: 1 });
  });
});
