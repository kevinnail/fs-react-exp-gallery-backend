const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');
const Message = require('../lib/models/Message.js');
const { completeAuction } = require('../lib/jobs/auctionTimers.js');
const Auction = require('../lib/models/Auction.js');
const Bid = require('../lib/models/Bid.js');

// mock AWS SDK S3 client — identical format as other suites
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

// websocket + scheduler mocks
global.wsService = {
  emitBidPlaced: jest.fn(),
  emitOutBidNotification: jest.fn(),
  emitAuctionBIN: jest.fn(),
  emitAuctionCreated: jest.fn(),
  emitNewMessage: jest.fn(),
  emitAuctionEnded: jest.fn(),
  emitUserWon: jest.fn(),
  io: {
    to: () => ({
      emit: jest.fn(),
    }),
  },
};

// standard mock user and helper
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
  const { user } = await UserService.create(userToUse);
  const { email } = user;
  await agent.post('/api/v1/users/sessions').send({ email, password });
  return [agent, user];
};

describe('Bid routes', () => {
  beforeEach(() => {
    return setup(pool);
  });

  afterAll(() => {
    pool.end();
  });

  // -----------------------------------------------------------
  describe('GET /api/v1/bids/:id', () => {
    it('returns 200 with list of bids for given auction', async () => {
      const [agent] = await registerAndLogin();
      // create auction first
      const auctionRes = await agent.post('/api/v1/auctions').send({
        auctionDetails: {
          title: 'Bid Test Auction',
          description: 'Auction for bid tests',
          startPrice: 100,
          buyNowPrice: 200,
          currentBid: 100,
          startTime: new Date(),
          endTime: new Date(Date.now() + 3600000),
        },
      });
      const auctionId = auctionRes.body.id;

      // place bid
      await agent.post('/api/v1/bids').send({
        auctionId,
        userId: 1,
        bidAmount: 150,
      });

      const res = await agent.get(`/api/v1/bids/${auctionId}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns empty array if auction has no bids', async () => {
      const [agent] = await registerAndLogin();
      const auctionRes = await agent.post('/api/v1/auctions').send({
        auctionDetails: {
          title: 'No Bids Auction',
          description: 'Auction with no bids',
          startPrice: 50,
          buyNowPrice: 100,
          currentBid: 50,
          startTime: new Date(),
          endTime: new Date(Date.now() + 3600000),
        },
      });
      const auctionId = auctionRes.body.id;

      const res = await agent.get(`/api/v1/bids/${auctionId}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // -----------------------------------------------------------
  describe('POST /api/v1/bids', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request(app).post('/api/v1/bids').send({
        auctionId: 1,
        userId: 1,
        bidAmount: 100,
      });
      expect(res.status).toBe(401);
    });

    it('creates new bid and emits websocket events', async () => {
      const [agent, user] = await registerAndLogin();
      const auctionRes = await agent.post('/api/v1/auctions').send({
        auctionDetails: {
          title: 'Bid Auction',
          description: 'Auction for placing bids',
          startPrice: 50,
          buyNowPrice: 100,
          currentBid: 50,
          startTime: new Date(),
          endTime: new Date(Date.now() + 3600000),
        },
      });
      const auctionId = auctionRes.body.id;

      const res = await agent.post('/api/v1/bids').send({
        auctionId,
        userId: user.id,
        bidAmount: 75,
      });

      expect(201).toEqual(res.status);
      expect(global.wsService.emitBidPlaced).toHaveBeenCalled();
    });

    it('creates outbid notification when new highest bid surpasses previous', async () => {
      const [agent, user1] = await registerAndLogin();
      const auctionRes = await agent.post('/api/v1/auctions').send({
        auctionDetails: {
          title: 'Outbid Auction',
          description: 'Auction for outbid test',
          startPrice: 100,
          buyNowPrice: 300,
          currentBid: 100,
          startTime: new Date(),
          endTime: new Date(Date.now() + 3600000),
        },
      });
      const auctionId = auctionRes.body.id;

      // first bid by user1
      await agent.post('/api/v1/bids').send({
        auctionId,
        userId: user1.id,
        bidAmount: 150,
      });

      // second user logs in and outbids
      const [agent2, user2] = await registerAndLogin({ email: 'outbidder@example.com' });
      await agent2.post('/api/v1/bids').send({
        auctionId,
        userId: user2.id,
        bidAmount: 200,
      });

      expect(global.wsService.emitOutBidNotification).toHaveBeenCalled();
    });

    it('returns 400 if missing auctionId/userId/bidAmount', async () => {
      const [agent] = await registerAndLogin();
      const res = await agent.post('/api/v1/bids').send({
        auctionId: null,
        userId: null,
        bidAmount: null,
      });

      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------
  describe('POST /api/v1/bids/buy-it-now', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request(app).post('/api/v1/bids/buy-it-now').send({
        auctionId: 1,
        userId: 1,
      });
      expect(res.status).toBe(401);
    });

    it('returns 400 if auction already closed', async () => {
      const [agent, user] = await registerAndLogin();
      const auctionRes = await agent.post('/api/v1/auctions').send({
        auctionDetails: {
          title: 'Closed Auction',
          description: 'Already closed auction',
          startPrice: 50,
          buyNowPrice: 100,
          currentBid: 50,
          startTime: new Date(),
          endTime: new Date(Date.now() + 3600000),
          isActive: false,
        },
      });
      const auctionId = auctionRes.body.id;

      const res = await agent.post('/api/v1/bids/buy-it-now').send({
        auctionId,
        userId: user.id,
      });
      expect(res.status).toBe(400);
    });

    it('marks auction inactive and emits BIN event', async () => {
      const [agent, user] = await registerAndLogin();
      const auctionRes = await agent.post('/api/v1/auctions').send({
        auctionDetails: {
          title: 'Buy It Now Auction',
          description: 'BIN auction test',
          startPrice: 100,
          buyNowPrice: 200,
          currentBid: 100,
          startTime: new Date(),
          endTime: new Date(Date.now() + 3600000),
        },
      });
      const auctionId = auctionRes.body.id;

      const res = await agent.post('/api/v1/bids/buy-it-now').send({
        auctionId,
        userId: user.id,
      });

      expect(res.status).toBe(200);
      expect(global.wsService.emitAuctionBIN).toHaveBeenCalled();
      expect(res.body).toHaveProperty('message', 'Auction purchased successfully');
    });
    it('creates a winner system message for the buyer on BIN', async () => {
      const [agent, user] = await registerAndLogin();

      const auctionRes = await agent.post('/api/v1/auctions').send({
        auctionDetails: {
          title: 'BIN msg test',
          description: 'tests BIN conversation message',
          startPrice: 10,
          buyNowPrice: 20,
          currentBid: 10,
          startTime: new Date(),
          endTime: new Date(Date.now() + 3600000),
        },
      });
      const auctionId = auctionRes.body.id;

      await agent.post('/api/v1/bids/buy-it-now').send({
        auctionId,
        userId: user.id,
      });

      const messages = await Message.getByUserId(user.id);
      const latest = messages[0];

      expect(latest).toBeDefined();
      expect(latest.isFromAdmin).toBe(true);
      expect(latest.messageContent).toMatch(/Congrats on winning|Congrats on the win/i);
    });
  });

  describe(' Cron job for expired auction', () => {
    it('creates a system winner message when auction expires naturally via cron', async () => {
      const [agent, user] = await registerAndLogin();

      // create auction ending in the past
      const auction = await Auction.insert({
        title: 'Cron Expire Test',
        description: 'testing cron expiration message',
        startPrice: 10,
        buyNowPrice: 50,
        currentBid: 10,
        startTime: new Date(),
        endTime: new Date(Date.now() - 2000), // already expired
      });

      // place a bid so there's a winner
      await Bid.insert({
        auctionId: auction.id,
        userId: user.id,
        bidAmount: 30,
      });

      // trigger cron finalization manually
      await completeAuction(auction.id);

      // fetch messages via model (decrypts automatically)
      const userMessages = await Message.getByUserId(user.id);

      const latest = userMessages[0];

      expect(latest).toBeDefined();
      expect(latest.isFromAdmin).toBe(true);
      expect(latest.messageContent).toMatch(/Congrats on the win/i);
    });
  });
});
