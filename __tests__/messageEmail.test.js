const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const UserService = require('../lib/services/UserService');
const User = require('../lib/models/User');
const Profile = require('../lib/models/Profile');
const { sendMessageNotificationEmail } = require('../lib/services/notificationEmailService');

jest.mock('../lib/utils/mailer.js', () => ({
  sendMessageEmail: jest.fn().mockResolvedValue(),
}));

const { sendMessageEmail } = require('../lib/utils/mailer.js');

const mockUserCreds = {
  email: 'message_email_test@example.com',
  password: '12345',
};

describe('message email notifications', () => {
  beforeEach(async () => {
    await setup(pool);
    jest.clearAllMocks();
  });

  afterAll(() => {
    pool.end();
  });

  it('sends email when user is opted-in and not throttled', async () => {
    const { user } = await UserService.create(mockUserCreds);
    const recipient = await User.getEmailById(user.id);
    // Ensure profile exists and is opted-in
    await Profile.upsertByUserId(user.id, {
      firstName: null,
      lastName: null,
      imageUrl: null,
      sendEmailNotifications: true,
    });

    const message = { messageContent: 'Hello from admin' };

    const result = await sendMessageNotificationEmail({ user: recipient, message });

    expect(result).toEqual({ sent: true });
    expect(sendMessageEmail).toHaveBeenCalledWith({ to: recipient.email, message });

    const updatedProfile = await Profile.getByUserId(user.id);
    expect(updatedProfile.lastMessageEmailAt).toBeTruthy();
  });

  it('does not send email when user is opted-out', async () => {
    const { user } = await UserService.create(mockUserCreds);
    // Ensure profile exists
    await Profile.upsertByUserId(user.id, {
      firstName: null,
      lastName: null,
      imageUrl: null,
      sendEmailNotifications: true,
    });
    // Opt-out
    await Profile.updateByUserId(user.id, {
      firstName: null,
      lastName: null,
      imageUrl: null,
      sendEmailNotifications: false,
    });

    const recipient = await User.getEmailById(user.id);
    const message = { messageContent: 'Hello from admin' };

    const result = await sendMessageNotificationEmail({ user: recipient, message });

    expect(result).toEqual({ sent: false, reason: 'opted-out' });
    expect(sendMessageEmail).not.toHaveBeenCalled();
  });

  it('does not send email when within throttle window', async () => {
    const { user } = await UserService.create(mockUserCreds);
    const recipient = await User.getEmailById(user.id);
    // Ensure profile exists and is opted-in
    await Profile.upsertByUserId(user.id, {
      firstName: null,
      lastName: null,
      imageUrl: null,
      sendEmailNotifications: true,
    });

    // Set last_message_email_at to recent (within 20 minutes)
    const ts = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await Profile.updateLastMessageEmailTimestamp(user.id, ts);

    const message = { messageContent: 'Another admin message' };

    const result = await sendMessageNotificationEmail({ user: recipient, message });

    expect(result).toEqual({ sent: false, reason: 'throttled' });
    expect(sendMessageEmail).not.toHaveBeenCalled();
  });
});
