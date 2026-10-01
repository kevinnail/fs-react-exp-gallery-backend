const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const Profile = require('../lib/models/Profile');
const { sendMassEmailToCustomers } = require('../lib/services/adminEmailService');
const UserService = require('../lib/services/UserService');

jest.mock('../lib/utils/mailer.js', () => ({
  sendMassEmail: jest.fn().mockResolvedValue(),
}));
const { sendMassEmail } = require('../lib/utils/mailer.js');

function makeProfileData({
  userId,
  firstName,
  lastName,
  imageUrl = null,
  sendEmailNotifications = true,
}) {
  return { userId, firstName, lastName, imageUrl, sendEmailNotifications };
}

const createUserWithProfile = async ({ email, sendEmailNotifications }) => {
  const { user } = await UserService.create({ email, password: 'Test1234!' });
  await Profile.insert(
    makeProfileData({
      userId: user.id,
      firstName: 'Test',
      lastName: 'User',
      sendEmailNotifications,
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
    await createUserWithProfile({ email: 'optin@example.com', sendEmailNotifications: true });
    await createUserWithProfile({ email: 'optout@example.com', sendEmailNotifications: false });

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

  it('counts a failed send and still emails the remaining recipients', async () => {
    await createUserWithProfile({ email: 'first@example.com', sendEmailNotifications: true });
    await createUserWithProfile({ email: 'second@example.com', sendEmailNotifications: true });

    // first recipient's send blows up; the loop must continue to the second
    sendMassEmail.mockRejectedValueOnce(new Error('smtp fail'));

    const result = await sendMassEmailToCustomers({ subject: 'Hi', message: 'Body' });

    expect(sendMassEmail).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ total: 2, sent: 1, failed: 1 });
  });
});
