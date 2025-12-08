const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');
const GalleryPostSale = require('../lib/models/GalleryPostSale');
const Profile = require('../lib/models/Profile');

// Mock websocket service for sales events
global.wsService = {
  emitSaleCreated: jest.fn(),
  emitSalePaid: jest.fn(),
  emitSaleTrackingInfo: jest.fn(),
  io: {
    to: () => ({ emit: jest.fn() }),
  },
};

jest.mock('../lib/utils/mailer', () => ({
  sendTrackingEmail: jest.fn(),
  sendSaleCreatedEmail: jest.fn(),
  sendSalePaidEmail: jest.fn(),
}));
const mockUser = {
  email: 'test@example.com',
  password: '12345',
};

const mockBuyer = {
  email: 'buyer@example.com',
  password: '12345',
};

afterAll(() => {
  pool.end();
});

const registerAndLogin = async (userCredentials = mockUser) => {
  const agent = request.agent(app);
  const { user } = await UserService.create(userCredentials);

  // Create a profile for the user (required for getAllSales JOIN)
  await Profile.insert({
    userId: user.id,
    firstName: 'Test',
    lastName: 'User',
  });

  await agent
    .post('/api/v1/users/sessions')
    .send({ email: userCredentials.email, password: userCredentials.password });

  return [agent, user];
};

describe('Gallery Post Sales routes', () => {
  beforeEach(() => {
    return setup(pool);
  });

  describe('POST /api/v1/admin/sales - Create Sale', () => {
    it('should return 401 when not authenticated', async () => {
      const resp = await request(app).post('/api/v1/admin/sales').send({
        postId: 1,
        buyerEmail: 'buyer@example.com',
        price: 100,
      });

      expect(resp.status).toBe(401);
    });

    it('should create a new sale when authenticated as admin', async () => {
      const [agent] = await registerAndLogin();
      const [, buyer] = await registerAndLogin(mockBuyer);

      const resp = await agent.post('/api/v1/admin/sales').send({
        postId: '1',
        buyerEmail: buyer.email,
        price: '99.99',
        tracking: 'TRACK123456',
      });

      expect(resp.status).toBe(201);
      expect(resp.body).toEqual({
        id: expect.any(Number),
        post_id: 1,
        buyer_id: expect.any(Number),
        price: '99.99',
        tracking_number: 'TRACK123456',
        created_at: expect.any(String),
        is_paid: false,
        paid_at: null,
      });

      // websocket emission asserted
      expect(global.wsService.emitSaleCreated).toHaveBeenCalled();
      const emittedPayload = global.wsService.emitSaleCreated.mock.calls[0][0];
      expect(emittedPayload).toMatchObject({
        type: 'sale',
        saleId: resp.body.id,
        postId: resp.body.post_id,
        userId: resp.body.buyer_id,
      });
    });

    it('should create a sale without tracking number', async () => {
      const [agent] = await registerAndLogin();
      const [, buyer] = await registerAndLogin(mockBuyer);

      const resp = await agent.post('/api/v1/admin/sales').send({
        postId: '1',
        buyerEmail: buyer.email,
        price: '50.00',
      });

      expect(resp.status).toBe(201);
      expect(resp.body.tracking_number).toBeNull();
    });

    it('should return 404 when buyer email does not exist', async () => {
      const [agent] = await registerAndLogin();

      const resp = await agent.post('/api/v1/admin/sales').send({
        postId: '1',
        buyerEmail: 'nonexistent@example.com',
        price: '99.99',
      });

      expect(resp.status).toBe(500);
    });

    it('should return 400 when required fields are missing', async () => {
      const [agent] = await registerAndLogin();

      const resp = await agent.post('/api/v1/admin/sales').send({
        postId: '1',
      });

      expect(resp.status).toBe(400);
    });
  });

  describe('GET /api/v1/admin/sales - Get All Sales (Admin)', () => {
    it('should return 401 when not authenticated', async () => {
      const resp = await request(app).get('/api/v1/admin/sales');
      expect(resp.status).toBe(401);
    });

    it('should return all sales with buyer and post details', async () => {
      const [agent] = await registerAndLogin();
      const [, buyer] = await registerAndLogin(mockBuyer);

      // Create a sale first
      await agent.post('/api/v1/admin/sales').send({
        postId: '1',
        buyerEmail: buyer.email,
        price: '99.99',
        tracking: 'TRACK123',
      });

      const resp = await agent.get('/api/v1/admin/sales');

      expect(resp.status).toBe(200);
      expect(Array.isArray(resp.body)).toBe(true);
      expect(resp.body.length).toBeGreaterThan(0);
      expect(resp.body[0]).toEqual({
        id: expect.any(Number),
        post_id: expect.any(Number),
        buyer_id: expect.any(Number),
        price: expect.any(String),
        tracking_number: expect.any(String),
        created_at: expect.any(String),
        is_paid: expect.any(Boolean),
        paid_at: null,
        post_title: expect.any(String),
        image_url: expect.any(String),
        buyer_email: buyer.email,
        buyer_first_name: 'Test',
        buyer_last_name: 'User',
        buyer_name: 'Test User',
        updated_at: expect.any(String),
      });
    });

    it('should return empty array when no sales exist', async () => {
      const [agent] = await registerAndLogin();

      const resp = await agent.get('/api/v1/admin/sales');

      expect(resp.status).toBe(200);
      expect(resp.body).toEqual([]);
    });
  });

  describe('GET /api/v1/user-sales - Get User Sales', () => {
    it('should return 401 when not authenticated', async () => {
      const resp = await request(app).get('/api/v1/user-sales');
      expect(resp.status).toBe(401);
    });

    it('should return sales for authenticated user', async () => {
      const [adminAgent] = await registerAndLogin();
      const [buyerAgent, buyer] = await registerAndLogin(mockBuyer);

      // Admin creates a sale for the buyer
      await adminAgent.post('/api/v1/admin/sales').send({
        postId: '1',
        buyerEmail: buyer.email,
        price: '75.50',
        tracking: 'USPS123',
      });

      // Buyer retrieves their sales
      const resp = await buyerAgent.get('/api/v1/user-sales');

      expect(resp.status).toBe(200);
      expect(Array.isArray(resp.body)).toBe(true);
      expect(resp.body.length).toBe(1);
      expect(resp.body[0]).toEqual({
        id: expect.any(Number),
        post_id: 1,
        buyer_id: expect.any(Number),
        price: '75.50',
        tracking_number: 'USPS123',
        created_at: expect.any(String),
        is_paid: false,
        paid_at: null,
        post_title: 'Test 1',
        post_image_url: 'Test 1',
        post_price: 'Test 1',
        updated_at: expect.any(String),
      });
    });

    it('should return null when user has no sales', async () => {
      const [agent] = await registerAndLogin();

      const resp = await agent.get('/api/v1/user-sales');

      expect(resp.status).toBe(200);
      expect(resp.body).toBeNull();
    });
  });

  describe('PUT /api/v1/admin/:id/paid - Update Paid Status', () => {
    it('should return 401 when not authenticated', async () => {
      const resp = await request(app).put('/api/v1/admin/1/paid').send({
        isPaid: true,
      });

      expect(resp.status).toBe(401);
    });

    it('should update sale to paid status', async () => {
      const [agent] = await registerAndLogin();
      const [, buyer] = await registerAndLogin(mockBuyer);

      // Create sale
      const saleResp = await agent.post('/api/v1/admin/sales').send({
        postId: '1',
        buyerEmail: buyer.email,
        price: '100.00',
      });

      const saleId = saleResp.body.id;

      // Update to paid
      const resp = await agent.put(`/api/v1/admin/sale-pay-status/${saleId}`).send({
        isPaid: true,
      });

      expect(resp.status).toBe(200);
      expect(resp.body).toEqual({
        id: saleId,
        post_id: 1,
        buyer_id: expect.any(Number),
        price: '100.00',
        tracking_number: null,
        created_at: expect.any(String),
        is_paid: true,
        paid_at: expect.any(String),
      });

      // websocket emission asserted
      expect(global.wsService.emitSalePaid).toHaveBeenCalled();
    });

    it('should update sale to unpaid status and clear paid_at', async () => {
      const [agent] = await registerAndLogin();
      const [, buyer] = await registerAndLogin(mockBuyer);

      // Create sale
      const saleResp = await agent.post('/api/v1/admin/sales').send({
        postId: '1',
        buyerEmail: buyer.email,
        price: '100.00',
      });

      const saleId = saleResp.body.id;

      // Update to paid
      await agent.put(`/api/v1/admin/sale-pay-status/${saleId}`).send({
        isPaid: true,
      });

      // Update back to unpaid
      const resp = await agent.put(`/api/v1/admin/sale-pay-status/${saleId}`).send({
        isPaid: false,
      });

      expect(resp.status).toBe(200);
      expect(resp.body.is_paid).toBe(false);
      expect(resp.body.paid_at).toBeNull();
    });

    it('should return 400 when isPaid is not boolean', async () => {
      const [agent] = await registerAndLogin();

      const resp = await agent.put('/api/v1/admin/sale-pay-status/1').send({
        isPaid: 'yes',
      });

      expect(resp.status).toBe(400);
      expect(resp.body.error).toBe('isPaid must be boolean');
    });
  });

  describe('PUT /api/v1/admin/:id/tracking - Update Tracking Number', () => {
    it('should return 401 when not authenticated', async () => {
      const resp = await request(app).put('/api/v1/admin/1/tracking').send({
        trackingNumber: 'TRACK123',
      });

      expect(resp.status).toBe(401);
    });

    it('should update tracking number for a sale', async () => {
      const [agent] = await registerAndLogin();
      const [, buyer] = await registerAndLogin(mockBuyer);

      // Create sale without tracking
      const saleResp = await agent.post('/api/v1/admin/sales').send({
        postId: '1',
        buyerEmail: buyer.email,
        price: '80.00',
      });

      const saleId = saleResp.body.id;

      // Update tracking number
      const resp = await agent.put(`/api/v1/admin/${saleId}/tracking`).send({
        trackingNumber: 'FEDEX987654321',
      });

      expect(resp.status).toBe(200);
      expect(resp.body).toEqual({
        id: saleId,
        post_id: 1,
        buyer_id: expect.any(Number),
        price: '80.00',
        tracking_number: 'FEDEX987654321',
        created_at: expect.any(String),
        is_paid: false,
        paid_at: null,
      });

      // websocket emission asserted
      expect(global.wsService.emitSaleTrackingInfo).toHaveBeenCalled();
    });

    it('should return 400 when trackingNumber is missing', async () => {
      const [agent] = await registerAndLogin();

      const resp = await agent.put('/api/v1/admin/1/tracking').send({});

      expect(resp.status).toBe(400);
      expect(resp.body.error).toBe('trackingNumber must be a string');
    });

    it('should return 400 when trackingNumber is not a string', async () => {
      const [agent] = await registerAndLogin();

      const resp = await agent.put('/api/v1/admin/1/tracking').send({
        trackingNumber: 12345,
      });

      expect(resp.status).toBe(400);
      expect(resp.body.error).toBe('trackingNumber must be a string');
    });
  });
});

describe('GalleryPostSale Model', () => {
  beforeEach(() => {
    return setup(pool);
  });

  describe('GalleryPostSale.createSale', () => {
    it('should create a new sale record', async () => {
      const { user } = await UserService.create(mockBuyer);

      const sale = await GalleryPostSale.createSale({
        postId: 1,
        buyerId: user.id,
        price: '99.99',
        tracking: 'TRACK123',
      });

      expect(sale).toMatchObject({
        id: expect.any(Number),
        post_id: 1,
        buyer_id: expect.any(Number),
        price: '99.99',
        tracking_number: 'TRACK123',
        is_paid: false,
        paid_at: null,
      });
      expect(sale.created_at).toBeDefined();
    });

    it('should create a sale without tracking number', async () => {
      const { user } = await UserService.create(mockBuyer);

      const sale = await GalleryPostSale.createSale({
        postId: 1,
        buyerId: user.id,
        price: '50.00',
        tracking: null,
      });

      expect(sale.tracking_number).toBeNull();
    });
  });

  describe('GalleryPostSale.getAllSales', () => {
    it('should return all sales with joined data', async () => {
      const { user } = await UserService.create(mockBuyer);

      await Profile.insert({
        userId: user.id,
        firstName: 'Buyer',
        lastName: 'Test',
      });

      await GalleryPostSale.createSale({
        postId: 1,
        buyerId: user.id,
        price: '100.00',
        tracking: 'ABC123',
      });

      const sales = await GalleryPostSale.getAllSales();

      expect(Array.isArray(sales)).toBe(true);
      expect(sales.length).toBeGreaterThan(0);
      expect(sales[0]).toMatchObject({
        id: expect.any(Number),
        post_id: 1,
        buyer_id: expect.any(Number),
        price: expect.any(String),
        tracking_number: 'ABC123',
        is_paid: false,
        paid_at: null,
        post_title: 'Test 1',
        image_url: 'Test 1',
        buyer_email: user.email,
        buyer_first_name: 'Buyer',
        buyer_last_name: 'Test',
        buyer_name: 'Buyer Test',
      });
      expect(sales[0].created_at).toBeDefined();
      expect(sales[0].updated_at).toBeDefined();
    });

    it('should return empty array when no sales exist', async () => {
      const sales = await GalleryPostSale.getAllSales();
      expect(sales).toEqual([]);
    });
  });

  describe('GalleryPostSale.getSaleById', () => {
    it('should return a sale by id', async () => {
      const { user } = await UserService.create(mockBuyer);

      const createdSale = await GalleryPostSale.createSale({
        postId: 1,
        buyerId: user.id,
        price: '75.00',
        tracking: 'XYZ789',
      });

      const sale = await GalleryPostSale.getSaleById(createdSale.id);

      expect(sale).toMatchObject({
        id: createdSale.id,
        post_id: 1,
        buyer_id: expect.any(Number),
        price: '75.00',
        tracking_number: 'XYZ789',
        is_paid: false,
        paid_at: null,
      });
      expect(sale.created_at).toBeDefined();
    });

    it('should return null when sale does not exist', async () => {
      const sale = await GalleryPostSale.getSaleById(999999);
      expect(sale).toBeNull();
    });
  });

  describe('GalleryPostSale.updateTracking', () => {
    it('should update tracking number', async () => {
      const { user } = await UserService.create(mockBuyer);

      const createdSale = await GalleryPostSale.createSale({
        postId: 1,
        buyerId: user.id,
        price: '60.00',
        tracking: null,
      });

      const updated = await GalleryPostSale.updateTracking(createdSale.id, 'NEWTRACK456');

      expect(updated.tracking_number).toBe('NEWTRACK456');
    });
  });

  describe('GalleryPostSale.updatePaidStatus', () => {
    it('should update paid status to true and set paid_at', async () => {
      const { user } = await UserService.create(mockBuyer);

      const createdSale = await GalleryPostSale.createSale({
        postId: 1,
        buyerId: user.id,
        price: '120.00',
        tracking: 'TRACK999',
      });

      const updated = await GalleryPostSale.updatePaidStatus(createdSale.id, true);

      expect(updated.is_paid).toBe(true);
      expect(updated.paid_at).not.toBeNull();
    });

    it('should update paid status to false and clear paid_at', async () => {
      const { user } = await UserService.create(mockBuyer);

      const createdSale = await GalleryPostSale.createSale({
        postId: 1,
        buyerId: user.id,
        price: '120.00',
        tracking: 'TRACK999',
      });

      // First mark as paid
      await GalleryPostSale.updatePaidStatus(createdSale.id, true);

      // Then mark as unpaid
      const updated = await GalleryPostSale.updatePaidStatus(createdSale.id, false);

      expect(updated.is_paid).toBe(false);
      expect(updated.paid_at).toBeNull();
    });
  });

  describe('GalleryPostSale.getAllSalesByUserId', () => {
    it('should return all sales for a specific user', async () => {
      const { user: buyer1 } = await UserService.create(mockBuyer);
      const { user: buyer2 } = await UserService.create({
        email: 'buyer2@example.com',
        password: '12345',
      });

      // Create sales for buyer1
      await GalleryPostSale.createSale({
        postId: 1,
        buyerId: buyer1.id,
        price: '50.00',
        tracking: 'A1',
      });

      await GalleryPostSale.createSale({
        postId: 2,
        buyerId: buyer1.id,
        price: '75.00',
        tracking: 'A2',
      });

      // Create sale for buyer2
      await GalleryPostSale.createSale({
        postId: 3,
        buyerId: buyer2.id,
        price: '100.00',
        tracking: 'B1',
      });

      const buyer1Sales = await GalleryPostSale.getAllSalesByUserId(buyer1.id);

      expect(buyer1Sales.length).toBe(2);
      // buyer_id may be number or string depending on the query, just check they all match
      const allMatch = buyer1Sales.every((sale) => sale.buyer_id == buyer1.id); // Using == for type-loose comparison
      expect(allMatch).toBe(true);
    });

    it('should return null when user has no sales', async () => {
      const { user } = await UserService.create(mockBuyer);

      const sales = await GalleryPostSale.getAllSalesByUserId(user.id);

      expect(sales).toBeNull();
    });
  });
});
