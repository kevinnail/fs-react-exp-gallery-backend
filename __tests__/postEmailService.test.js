const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const Profile = require('../lib/models/Profile');
const { notifyUsersNewPost } = require('../lib/services/postEmailService');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');

jest.mock('../lib/utils/mailer.js', () => ({
  sendNewPostEmail: jest.fn().mockResolvedValue(),
}));
const { sendNewPostEmail } = require('../lib/utils/mailer.js');

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
  password: 'Test1234!',
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

const getLastPostEmailAt = async (userId) => {
  const { rows } = await pool.query('SELECT last_post_email_at FROM profiles WHERE user_id = $1', [
    userId,
  ]);
  return rows[0].last_post_email_at;
};

describe('postEmailService integration', () => {
  beforeEach(async () => {
    await setup(pool);
    jest.clearAllMocks();
  });

  afterAll(() => {
    pool.end();
  });

  it('sends emails to users with notifications enabled and updates timestamp', async () => {
    const [, user] = await registerAndLogin({ email: 'post1@example.com' });
    await Profile.insert(
      makeProfileData({
        userId: user.id,
        firstName: 'Post',
        lastName: 'One',
        sendEmailNotifications: true,
      }),
    );

    const post = { id: 1, title: 'Test Post' };
    await notifyUsersNewPost({ post });

    expect(sendNewPostEmail).toHaveBeenCalledWith({ to: 'post1@example.com', post });
    expect(await getLastPostEmailAt(user.id)).not.toBeNull();
  });

  it('does not send email if cooldown not passed', async () => {
    const [, user] = await registerAndLogin({ email: 'post2@example.com' });
    await Profile.insert(
      makeProfileData({
        userId: user.id,
        firstName: 'Post',
        lastName: 'Two',
        sendEmailNotifications: true,
      }),
    );
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await pool.query('UPDATE profiles SET last_post_email_at = $2 WHERE user_id = $1', [
      user.id,
      oneHourAgo,
    ]);

    const post = { id: 2, title: 'Test Post 2' };
    await notifyUsersNewPost({ post });

    expect(sendNewPostEmail).not.toHaveBeenCalled();
    // the stale timestamp must survive a suppressed send
    expect(new Date(await getLastPostEmailAt(user.id)).getTime()).toBe(oneHourAgo.getTime());
  });

  it('sends email if cooldown passed', async () => {
    const [, user] = await registerAndLogin({ email: 'post3@example.com' });
    await Profile.insert(
      makeProfileData({
        userId: user.id,
        firstName: 'Post',
        lastName: 'Three',
        sendEmailNotifications: true,
      }),
    );
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await pool.query('UPDATE profiles SET last_post_email_at = $2 WHERE user_id = $1', [
      user.id,
      threeHoursAgo,
    ]);

    const post = { id: 3, title: 'Test Post 3' };
    const before = Date.now();
    await notifyUsersNewPost({ post });
    const after = Date.now();

    expect(sendNewPostEmail).toHaveBeenCalledWith({ to: 'post3@example.com', post });
    const lastPostEmailAt = new Date(await getLastPostEmailAt(user.id)).getTime();
    // Allow a 5 second window for timing issues
    expect(lastPostEmailAt).toBeGreaterThanOrEqual(before - 5000);
    expect(lastPostEmailAt).toBeLessThanOrEqual(after + 5000);
  });

  it('does not send email to users with notifications disabled', async () => {
    const [, user] = await registerAndLogin({ email: 'post4@example.com' });
    await Profile.insert(
      makeProfileData({
        userId: user.id,
        firstName: 'No',
        lastName: 'Notify',
        sendEmailNotifications: false,
      }),
    );

    const post = { id: 4, title: 'Test Post 4' };
    await notifyUsersNewPost({ post });

    expect(sendNewPostEmail).not.toHaveBeenCalled();
  });

  it('handles errors gracefully and does not record a timestamp for a failed send', async () => {
    const [, user] = await registerAndLogin({ email: 'post5@example.com' });
    await Profile.insert(
      makeProfileData({
        userId: user.id,
        firstName: 'Error',
        lastName: 'Case',
        sendEmailNotifications: true,
      }),
    );
    sendNewPostEmail.mockRejectedValueOnce(new Error('fail'));

    const post = { id: 5, title: 'Test Post 5' };
    await notifyUsersNewPost({ post });

    expect(await getLastPostEmailAt(user.id)).toBeNull();
  });

  // This is the regression that caused the 11-post inbox flood: a batch of posts
  // uploaded back to back must produce exactly one email, for the first post only.
  it('sends only one email when several posts are created back to back', async () => {
    const [, user] = await registerAndLogin({ email: 'post6@example.com' });
    await Profile.insert(
      makeProfileData({
        userId: user.id,
        firstName: 'Batch',
        lastName: 'Upload',
        sendEmailNotifications: true,
      }),
    );

    for (let postNumber = 1; postNumber <= 11; postNumber++) {
      await notifyUsersNewPost({ post: { id: postNumber, title: `Piece ${postNumber}` } });
    }

    expect(sendNewPostEmail).toHaveBeenCalledTimes(1);
    expect(sendNewPostEmail).toHaveBeenCalledWith({
      to: 'post6@example.com',
      post: { id: 1, title: 'Piece 1' },
    });
  });

  it('throttles each recipient independently', async () => {
    const [, throttledUser] = await registerAndLogin({ email: 'post7@example.com' });
    const [, freshUser] = await registerAndLogin({ email: 'post8@example.com' });
    await Profile.insert(
      makeProfileData({ userId: throttledUser.id, firstName: 'Recently', lastName: 'Mailed' }),
    );
    await Profile.insert(
      makeProfileData({ userId: freshUser.id, firstName: 'Never', lastName: 'Mailed' }),
    );
    await pool.query('UPDATE profiles SET last_post_email_at = $2 WHERE user_id = $1', [
      throttledUser.id,
      new Date(Date.now() - 5 * 60 * 1000),
    ]);

    const post = { id: 9, title: 'Test Post 9' };
    await notifyUsersNewPost({ post });

    expect(sendNewPostEmail).toHaveBeenCalledTimes(1);
    expect(sendNewPostEmail).toHaveBeenCalledWith({ to: 'post8@example.com', post });
  });
});
