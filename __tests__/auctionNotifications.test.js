const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');
const AuctionNotification = require('../lib/models/AuctionNotification');

// mock AWS SDK S3 client (same as other test files)
jest.mock('@aws-sdk/client-s3', () => {
  const mockS3Send = jest.fn().mockImplementation((command) => {
    if (command.constructor.name === 'PutObjectCommand') {
      return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
    }
    if (command.constructor.name === 'DeleteObjectCommand') {
      return Promise.resolve({ $metadata: { httpStatusCode: 204 } });
    }
  });

  return {
    S3Client: jest.fn(() => ({
      send: mockS3Send,
    })),
    PutObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
  };
});

// mock global websocket service (placeholder, consistent pattern)
global.wsService = {
  emitAuctionCreated: jest.fn(),
  emitBidPlaced: jest.fn(),
  emitOutBidNotification: jest.fn(),
  emitAuctionBIN: jest.fn(),
};

// mock user setup helper
const mockUser = {
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  password: '12345',
};

const registerAndLogin = async (userProps = {}) => {
  const userToUse = { ...mockUser, ...userProps };
  const password = userToUse.password;

  const agent = request.agent(app);
  const user = await UserService.create(userToUse);
  const { email } = user;
  await agent.post('/api/v1/users/sessions').send({ email, password });
  return [agent, user];
};

describe('Auction Notification routes', () => {
  beforeEach(() => {
    return setup(pool);
  });

  afterAll(() => {
    pool.end();
  });

  // -----------------------------------------------------------
  describe('GET /api/v1/auction-notifications', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/v1/auction-notifications');
      expect(res.status).toBe(401);
    });

    it('returns empty array when authenticated and no unread notifications', async () => {
      const [agent] = await registerAndLogin();
      const res = await agent.get('/api/v1/auction-notifications');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns unread notifications for the user', async () => {
      const [agent, user] = await registerAndLogin();

      // create auction to satisfy FK constraint
      await agent.post('/api/v1/auctions').send({
        auctionDetails: {
          title: 'Notification Auction',
          description: 'For FK test',
          startPrice: 50,
          buyNowPrice: 100,
          currentBid: 50,
          startTime: new Date(),
          endTime: new Date(Date.now() + 3600000),
        },
      });

      // manually insert fake notifications into DB
      await AuctionNotification.insert({
        userId: user.id,
        auctionId: 1,
        type: 'outbid',
      });

      const res = await agent.get('/api/v1/auction-notifications');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toMatchObject({
        userId: user.id,
        auctionId: '1',
        type: 'outbid',
        isRead: false,
      });
    });
  });

  // -----------------------------------------------------------
  describe('PATCH /api/v1/auction-notifications/mark-read', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).patch('/api/v1/auction-notifications/mark-read');
      expect(res.status).toBe(401);
    });

    it('marks all notifications as read for current user', async () => {
      const [agent, user] = await registerAndLogin();
      // create auction to satisfy FK constraint
      await agent.post('/api/v1/auctions').send({
        auctionDetails: {
          title: 'Notification Auction',
          description: 'For FK test',
          startPrice: 50,
          buyNowPrice: 100,
          currentBid: 50,
          startTime: new Date(),
          endTime: new Date(Date.now() + 3600000),
        },
      });

      await agent.post('/api/v1/auctions').send({
        auctionDetails: {
          title: 'Notification Auction 2',
          description: 'For FK test 2',
          startPrice: 52,
          buyNowPrice: 102,
          currentBid: 52,
          startTime: new Date(),
          endTime: new Date(Date.now() + 3600000),
        },
      });

      // create 2 unread notifications
      await AuctionNotification.insert({
        userId: user.id,
        auctionId: 1,
        type: 'outbid',
      });
      await AuctionNotification.insert({
        userId: user.id,
        auctionId: 2,
        type: 'outbid',
      });

      // confirm both are unread
      const beforeRes = await agent.get('/api/v1/auction-notifications');
      expect(beforeRes.body.length).toBe(2);
      expect(beforeRes.body.every((n) => n.isRead === false)).toBe(true);

      // call mark-read
      const markRes = await agent.patch('/api/v1/auction-notifications/mark-read');
      expect(markRes.status).toBe(200);
      expect(markRes.body).toEqual({
        message: 'All auction notifications marked as read',
      });

      // confirm DB updated
      const after = await AuctionNotification.getUnreadByUserId(user.id);
      expect(after.length).toBe(0);
    });
  });

  // -----------------------------------------------------------
  // ^ Was prebuilt- could come in handy, corresponding fetch on front end as well
  //   describe('GET /api/v1/auction-notifications/all', () => {
  // it('returns 401 when unauthenticated', async () => {
  //   const res = await request(app).get('/api/v1/auction-notifications/all');
  //   expect(res.status).toBe(401);
  // });

  //     it('returns all notifications (read and unread)', async () => {
  //       const [agent, user] = await registerAndLogin();
  //       // one unread + one marked read
  //       await AuctionNotification.insert({
  //         userId: user.id,
  //         auctionId: 2,
  //         type: 'outbid',
  //       });
  //       await AuctionNotification.markAsRead(user.id);
  //       const res = await agent.get('/api/v1/auction-notifications/all');
  //       expect(res.status).toBe(200);
  //       expect(Array.isArray(res.body)).toBe(true);
  //       // confirm contains at least the previously read item
  //       expect(res.body.some((n) => n.userId === user.id)).toBe(true);
  //     });
  //   });
});
