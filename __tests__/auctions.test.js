const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');
const FormData = require('form-data');

// mock AWS SDK S3 client
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

// mock websocket + auction scheduler
global.wsService = {
  emitAuctionCreated: jest.fn(),
};

jest.mock('../lib/jobs/auctionTimers', () => ({
  scheduleAuctionEnd: jest.fn(),
}));

const { scheduleAuctionEnd } = require('../lib/jobs/auctionTimers');

describe('Auction routes', () => {
  beforeEach(() => {
    return setup(pool);
  });

  afterAll(() => {
    jest.clearAllMocks();

    pool.end();
  });

  // -----------------------------------------------------------
  describe('GET /api/v1/auctions', () => {
    it('returns array of auctions', async () => {
      const res = await request(app).get('/api/v1/auctions');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // -----------------------------------------------------------
  describe('GET /api/v1/auctions/:id', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request(app).get('/api/v1/auctions/1');
      expect(res.status).toBe(401);
    });

    it('returns 200 and auction when authenticated', async () => {
      const [agent] = await registerAndLogin();
      const createRes = await agent.post('/api/v1/auctions').send({
        auctionDetails: {
          title: 'Test Auction',
          description: 'Example auction',
          startPrice: 100,
          buyNowPrice: 200,
          currentBid: 100,
          startTime: new Date(),
          endTime: new Date(Date.now() + 3600000),
        },
      });

      const auctionId = createRes.body.id;
      const res = await agent.get(`/api/v1/auctions/${auctionId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('title', 'Test Auction');
    });
  });

  // -----------------------------------------------------------
  describe('POST /api/v1/auctions', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request(app).post('/api/v1/auctions').send({});
      expect(res.status).toBe(401);
    });

    it('returns 400 when missing auctionDetails', async () => {
      const [agent] = await registerAndLogin();
      const res = await agent.post('/api/v1/auctions').send({});
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Message content is required' });
    });

    it('creates auction and emits websocket event', async () => {
      const [agent] = await registerAndLogin();
      const res = await agent.post('/api/v1/auctions').send({
        auctionDetails: {
          title: 'Functional Auction',
          description: 'Auction for test',
          startPrice: 50,
          buyNowPrice: 100,
          currentBid: 50,
          startTime: new Date(),
          endTime: new Date(Date.now() + 3600000),
        },
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
      expect(scheduleAuctionEnd).toHaveBeenCalled();
      expect(global.wsService.emitAuctionCreated).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------
  describe('POST /api/v1/auctions/upload', () => {
    it('uploads files to S3 and returns results', async () => {
      const form = new FormData();
      form.append('imageFiles', Buffer.from('fake file content'), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

      const res = await request(app)
        .post('/api/v1/auctions/upload')
        .set(form.getHeaders())
        .send(form.getBuffer());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toHaveProperty('secure_url');
    });

    it('returns 500 if upload fails', async () => {
      const { S3Client } = require('@aws-sdk/client-s3');
      const mockInstance = new S3Client(); // this is your mocked instance from jest.mock
      mockInstance.send.mockRejectedValueOnce(new Error('Upload failed'));

      const form = new FormData();
      form.append('imageFiles', Buffer.from('bad content'), {
        filename: 'bad.jpg',
        contentType: 'image/jpeg',
      });

      const res = await request(app)
        .post('/api/v1/auctions/upload')
        .set(form.getHeaders())
        .send(form.getBuffer());

      expect(res.status).toBe(500);
    });
  });

  // -----------------------------------------------------------
  describe('PUT /api/v1/auctions/:id', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request(app).put('/api/v1/auctions/1').send({});
      expect(res.status).toBe(401);
    });

    it('returns 404 when auction not found', async () => {
      const [agent] = await registerAndLogin();
      const res = await agent.put('/api/v1/auctions/9999').send({
        id: 9999,
        auction: { title: 'Updated Title' },
      });
      expect(res.status).toBe(404);
    });

    it('updates auction fields successfully', async () => {
      const [agent] = await registerAndLogin();
      const createRes = await agent.post('/api/v1/auctions').send({
        auctionDetails: {
          title: 'Updatable Auction',
          description: 'Before update',
          startPrice: 75,
          buyNowPrice: 150,
          currentBid: 75,
          startTime: new Date(),
          endTime: new Date(Date.now() + 3600000),
        },
      });

      const auctionId = createRes.body.id;
      const res = await agent.put(`/api/v1/auctions/${auctionId}`).send({
        id: auctionId,
        auction: {
          title: 'Updated Auction',
          description: 'Updated description',
          imageUrls: [],
          isActive: true,
        },
      });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Auction');
    });
  });
});
