const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');
const Profile = require('../lib/models/Profile');
const { buildUnsubscribeUrl } = require('../lib/utils/unsubscribeToken');

const tokenFrom = (unsubscribeUrl) => unsubscribeUrl.split('token=')[1];

const createCustomer = async (email) => {
  const { user } = await UserService.create({ email, password: 'Test1234!' });
  await Profile.insert({ userId: user.id });
  return user;
};

const emailPreferencesOf = async (userId) => {
  const profile = await Profile.getByUserId(userId);
  return {
    emailAuctions: profile.emailAuctions,
    emailGalleryPosts: profile.emailGalleryPosts,
    emailPromotions: profile.emailPromotions,
    emailMessages: profile.emailMessages,
  };
};

const ALL_ON = {
  emailAuctions: true,
  emailGalleryPosts: true,
  emailPromotions: true,
  emailMessages: true,
};

describe('POST /api/v1/unsubscribe', () => {
  beforeEach(() => setup(pool));

  afterAll(() => {
    pool.end();
  });

  it('turns off only the category the link was sent for, without signing in', async () => {
    const user = await createCustomer('auctions@example.com');
    const token = tokenFrom(buildUnsubscribeUrl(user.id, 'auctions'));

    const resp = await request(app).post('/api/v1/unsubscribe').send({ token });

    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({ unsubscribedFrom: ['auctions'] });
    expect(await emailPreferencesOf(user.id)).toEqual({ ...ALL_ON, emailAuctions: false });
  });

  it('turns off every marketing category with all, leaving message emails on', async () => {
    const user = await createCustomer('everything@example.com');
    const token = tokenFrom(buildUnsubscribeUrl(user.id, 'promotions'));

    const resp = await request(app).post('/api/v1/unsubscribe').send({ token, all: true });

    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({ unsubscribedFrom: ['auctions', 'galleryPosts', 'promotions'] });
    expect(await emailPreferencesOf(user.id)).toEqual({
      emailAuctions: false,
      emailGalleryPosts: false,
      emailPromotions: false,
      emailMessages: true,
    });
  });

  it('only affects the user the link was issued to', async () => {
    const linkOwner = await createCustomer('owner@example.com');
    const bystander = await createCustomer('bystander@example.com');
    const token = tokenFrom(buildUnsubscribeUrl(linkOwner.id, 'galleryPosts'));

    await request(app).post('/api/v1/unsubscribe').send({ token, all: true });

    expect(await emailPreferencesOf(bystander.id)).toEqual(ALL_ON);
  });

  it('returns 400 and changes nothing for a token signed with another secret', async () => {
    const user = await createCustomer('forged@example.com');
    const forgedToken = jwt.sign({ userId: String(user.id), category: 'auctions' }, 'not-ours');

    const resp = await request(app)
      .post('/api/v1/unsubscribe')
      .send({ token: forgedToken, all: true });

    expect(resp.status).toBe(400);
    expect(await emailPreferencesOf(user.id)).toEqual(ALL_ON);
  });

  it('returns 400 for a validly signed token with an unknown category', async () => {
    const user = await createCustomer('unknown-category@example.com');
    const token = jwt.sign(
      { userId: String(user.id), category: 'messages' },
      process.env.UNSUBSCRIBE_SECRET,
    );

    const resp = await request(app).post('/api/v1/unsubscribe').send({ token });

    expect(resp.status).toBe(400);
    expect(await emailPreferencesOf(user.id)).toEqual(ALL_ON);
  });

  it('returns 400 when the token is missing or garbage', async () => {
    const missing = await request(app).post('/api/v1/unsubscribe').send({});
    const garbage = await request(app).post('/api/v1/unsubscribe').send({ token: 'abc.def' });

    expect(missing.status).toBe(400);
    expect(garbage.status).toBe(400);
  });

  it('returns 404 when the user has no profile', async () => {
    const { user } = await UserService.create({
      email: 'no-profile@example.com',
      password: 'Test1234!',
    });
    const token = tokenFrom(buildUnsubscribeUrl(user.id, 'auctions'));

    const resp = await request(app).post('/api/v1/unsubscribe').send({ token });

    expect(resp.status).toBe(404);
  });
});
