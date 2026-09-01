const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');
const SalesOrder = require('../lib/models/SalesOrder');
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
  password: 'Test1234!',
};

const mockBuyer = {
  email: 'buyer@example.com',
  password: 'Test1234!',
};

// setup.sql seeds three gallery posts, ids 1 through 3
const SEEDED_POST_IDS = [1, 2, 3];
const MISSING_POST_ID = 999999;

afterAll(() => {
  pool.end();
});

const registerAndLogin = async (userCredentials = mockUser) => {
  const agent = request.agent(app);
  const { user } = await UserService.create(userCredentials);

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

const countRows = async (table) => {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS total FROM ${table};`);
  return rows[0].total;
};

const isPostSold = async (postId) => {
  const { rows } = await pool.query('SELECT sold FROM gallery_posts WHERE id = $1;', [postId]);
  return rows[0].sold;
};

describe('Sales order routes', () => {
  beforeEach(() => {
    return setup(pool);
  });

  describe('POST /api/v1/admin/sales - Create order', () => {
    it('should return 401 when not authenticated', async () => {
      const resp = await request(app)
        .post('/api/v1/admin/sales')
        .send({
          buyerEmail: mockBuyer.email,
          items: [{ postId: SEEDED_POST_IDS[0], price: 100 }],
        });

      expect(resp.status).toBe(401);
    });

    it('should create one order with two items and mark both pieces sold', async () => {
      const [agent] = await registerAndLogin();
      const [, buyer] = await registerAndLogin(mockBuyer);

      const resp = await agent.post('/api/v1/admin/sales').send({
        buyerEmail: buyer.email,
        items: [
          { postId: SEEDED_POST_IDS[0], price: '99.99' },
          { postId: SEEDED_POST_IDS[1], price: '150.00' },
        ],
        shippingCost: '11',
        tracking: 'TRACK123456',
      });

      expect(resp.status).toBe(201);
      expect(resp.body).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          buyer_id: buyer.id,
          shipping_cost: '11.00',
          tracking_number: 'TRACK123456',
          is_paid: false,
          paid_at: null,
        }),
      );

      expect(resp.body.items).toHaveLength(2);
      expect(resp.body.items.map((item) => item.post_id)).toEqual([
        SEEDED_POST_IDS[0],
        SEEDED_POST_IDS[1],
      ]);
      expect(resp.body.items.map((item) => item.price)).toEqual(['99.99', '150.00']);
      expect(resp.body.items.every((item) => item.order_id === resp.body.id)).toBe(true);

      const itemsSubtotal = resp.body.items.reduce(
        (runningTotal, item) => runningTotal + Number(item.price),
        0,
      );
      expect(itemsSubtotal).toBeCloseTo(249.99);
      expect(itemsSubtotal + Number(resp.body.shipping_cost)).toBeCloseTo(260.99);

      expect(await countRows('sales_orders')).toBe(1);
      expect(await countRows('gallery_post_sales')).toBe(2);
      expect(await isPostSold(SEEDED_POST_IDS[0])).toBe(true);
      expect(await isPostSold(SEEDED_POST_IDS[1])).toBe(true);
      expect(await isPostSold(SEEDED_POST_IDS[2])).toBe(false);
    });

    it('should create a single-piece order the same way', async () => {
      const [agent] = await registerAndLogin();
      const [, buyer] = await registerAndLogin(mockBuyer);

      const resp = await agent.post('/api/v1/admin/sales').send({
        buyerEmail: buyer.email,
        items: [{ postId: SEEDED_POST_IDS[0], price: '75.50' }],
      });

      expect(resp.status).toBe(201);
      expect(resp.body.items).toHaveLength(1);
      expect(resp.body.items[0].price).toBe('75.50');
      // shippingCost omitted defaults to zero rather than NULL
      expect(resp.body.shipping_cost).toBe('0.00');
      expect(resp.body.tracking_number).toBeNull();

      expect(await countRows('sales_orders')).toBe(1);
      expect(await isPostSold(SEEDED_POST_IDS[0])).toBe(true);
    });

    it('should return 400 when items is an empty array', async () => {
      const [agent] = await registerAndLogin();
      await registerAndLogin(mockBuyer);

      const resp = await agent.post('/api/v1/admin/sales').send({
        buyerEmail: mockBuyer.email,
        items: [],
        shippingCost: 10,
      });

      expect(resp.status).toBe(400);
      expect(resp.body.message).toBe('items must be a non-empty array');
      expect(await countRows('sales_orders')).toBe(0);
    });

    it('should return 400 when an item has a non-numeric price', async () => {
      const [agent] = await registerAndLogin();
      const [, buyer] = await registerAndLogin(mockBuyer);

      const resp = await agent.post('/api/v1/admin/sales').send({
        buyerEmail: buyer.email,
        items: [{ postId: SEEDED_POST_IDS[0], price: 'free' }],
      });

      expect(resp.status).toBe(400);
      expect(resp.body.message).toBe('each item requires a postId and a numeric price');
      expect(await countRows('sales_orders')).toBe(0);
    });

    it('should return 400 when shippingCost is negative', async () => {
      const [agent] = await registerAndLogin();
      const [, buyer] = await registerAndLogin(mockBuyer);

      const resp = await agent.post('/api/v1/admin/sales').send({
        buyerEmail: buyer.email,
        items: [{ postId: SEEDED_POST_IDS[0], price: 20 }],
        shippingCost: -5,
      });

      expect(resp.status).toBe(400);
      expect(resp.body.message).toBe('shippingCost must be a number of at least 0');
      expect(await countRows('sales_orders')).toBe(0);
    });

    it('should return 404 when the buyer email is unknown', async () => {
      const [agent] = await registerAndLogin();

      const resp = await agent.post('/api/v1/admin/sales').send({
        buyerEmail: 'nobody@example.com',
        items: [{ postId: SEEDED_POST_IDS[0], price: 20 }],
      });

      expect(resp.status).toBe(404);
      expect(resp.body.message).toBe('Buyer not found');
      expect(await countRows('sales_orders')).toBe(0);
      expect(await isPostSold(SEEDED_POST_IDS[0])).toBe(false);
    });

    it('should roll back entirely when one item references a nonexistent post', async () => {
      const [agent] = await registerAndLogin();
      const [, buyer] = await registerAndLogin(mockBuyer);

      const resp = await agent.post('/api/v1/admin/sales').send({
        buyerEmail: buyer.email,
        items: [
          { postId: SEEDED_POST_IDS[0], price: 20 },
          { postId: MISSING_POST_ID, price: 30 },
        ],
      });

      expect(resp.status).toBe(500);
      expect(await countRows('sales_orders')).toBe(0);
      expect(await countRows('gallery_post_sales')).toBe(0);
      expect(await isPostSold(SEEDED_POST_IDS[0])).toBe(false);
    });
  });

  describe('GET /api/v1/admin/sales - List orders', () => {
    it('should return 401 when not authenticated', async () => {
      const resp = await request(app).get('/api/v1/admin/sales');

      expect(resp.status).toBe(401);
    });

    it('should return orders with their items and buyer details nested', async () => {
      const [agent] = await registerAndLogin();
      const [, buyer] = await registerAndLogin(mockBuyer);

      await SalesOrder.createOrder({
        buyerId: buyer.id,
        items: [
          { postId: SEEDED_POST_IDS[0], price: '10.00' },
          { postId: SEEDED_POST_IDS[1], price: '20.00' },
        ],
        shippingCost: '11.00',
        tracking: 'ABC123',
      });

      const resp = await agent.get('/api/v1/admin/sales');

      expect(resp.status).toBe(200);
      expect(resp.body).toHaveLength(1);
      expect(resp.body[0]).toEqual(
        expect.objectContaining({
          buyer_id: buyer.id,
          buyer_email: buyer.email,
          buyer_name: 'Test User',
          shipping_cost: '11.00',
          tracking_number: 'ABC123',
        }),
      );
      expect(resp.body[0].items).toHaveLength(2);
      expect(resp.body[0].items[0]).toEqual(
        expect.objectContaining({
          post_id: SEEDED_POST_IDS[0],
          price: '10.00',
          post_title: 'Test 1',
        }),
      );
    });

    it('should return an empty array when there are no orders', async () => {
      const [agent] = await registerAndLogin();

      const resp = await agent.get('/api/v1/admin/sales');

      expect(resp.status).toBe(200);
      expect(resp.body).toEqual([]);
    });
  });

  describe('PUT /api/v1/admin/sale-pay-status/:id', () => {
    it('should return 401 when not authenticated', async () => {
      const resp = await request(app).put('/api/v1/admin/sale-pay-status/1').send({ isPaid: true });

      expect(resp.status).toBe(401);
    });

    it('should mark an order paid and stamp paid_at', async () => {
      const [agent] = await registerAndLogin();
      const [, buyer] = await registerAndLogin(mockBuyer);

      const order = await SalesOrder.createOrder({
        buyerId: buyer.id,
        items: [{ postId: SEEDED_POST_IDS[0], price: '10.00' }],
        shippingCost: 0,
        tracking: null,
      });

      const resp = await agent
        .put(`/api/v1/admin/sale-pay-status/${order.id}`)
        .send({ isPaid: true });

      expect(resp.status).toBe(200);
      expect(resp.body.is_paid).toBe(true);
      expect(resp.body.paid_at).not.toBeNull();

      const stored = await SalesOrder.getOrderById(order.id);
      expect(stored.is_paid).toBe(true);
      expect(stored.paid_at).not.toBeNull();
    });

    it('should clear paid_at when an order is marked unpaid again', async () => {
      const [agent] = await registerAndLogin();
      const [, buyer] = await registerAndLogin(mockBuyer);

      const order = await SalesOrder.createOrder({
        buyerId: buyer.id,
        items: [{ postId: SEEDED_POST_IDS[0], price: '10.00' }],
        shippingCost: 0,
        tracking: null,
      });

      await agent.put(`/api/v1/admin/sale-pay-status/${order.id}`).send({ isPaid: true });
      const resp = await agent
        .put(`/api/v1/admin/sale-pay-status/${order.id}`)
        .send({ isPaid: false });

      expect(resp.status).toBe(200);
      expect(resp.body.is_paid).toBe(false);
      expect(resp.body.paid_at).toBeNull();
    });

    it('should return 400 when isPaid is not a boolean', async () => {
      const [agent] = await registerAndLogin();

      const resp = await agent.put('/api/v1/admin/sale-pay-status/1').send({ isPaid: 'yes' });

      expect(resp.status).toBe(400);
      expect(resp.body.error).toBe('isPaid must be boolean');
    });

    it('should return 404 for an unknown order id', async () => {
      const [agent] = await registerAndLogin();

      const resp = await agent
        .put(`/api/v1/admin/sale-pay-status/${MISSING_POST_ID}`)
        .send({ isPaid: true });

      expect(resp.status).toBe(404);
      expect(resp.body.error).toBe('Order not found');
    });
  });

  describe('PUT /api/v1/admin/:id/tracking', () => {
    it('should return 401 when not authenticated', async () => {
      const resp = await request(app)
        .put('/api/v1/admin/1/tracking')
        .send({ trackingNumber: 'TRACK123' });

      expect(resp.status).toBe(401);
    });

    it('should set the tracking number on the order', async () => {
      const [agent] = await registerAndLogin();
      const [, buyer] = await registerAndLogin(mockBuyer);

      const order = await SalesOrder.createOrder({
        buyerId: buyer.id,
        items: [{ postId: SEEDED_POST_IDS[0], price: '10.00' }],
        shippingCost: 0,
        tracking: null,
      });

      const resp = await agent
        .put(`/api/v1/admin/${order.id}/tracking`)
        .send({ trackingNumber: 'FEDEX987654321' });

      expect(resp.status).toBe(200);
      expect(resp.body.tracking_number).toBe('FEDEX987654321');

      const stored = await SalesOrder.getOrderById(order.id);
      expect(stored.tracking_number).toBe('FEDEX987654321');
    });

    it('should return 400 when trackingNumber is not a string', async () => {
      const [agent] = await registerAndLogin();

      const resp = await agent.put('/api/v1/admin/1/tracking').send({ trackingNumber: 12345 });

      expect(resp.status).toBe(400);
      expect(resp.body.error).toBe('trackingNumber must be a string');
    });
  });

  describe('GET /api/v1/user-sales', () => {
    it('should return 401 when not authenticated', async () => {
      const resp = await request(app).get('/api/v1/user-sales');

      expect(resp.status).toBe(401);
    });

    it('should return only the orders belonging to the signed-in user', async () => {
      await registerAndLogin();
      const [buyerAgent, buyer] = await registerAndLogin(mockBuyer);
      const { user: otherBuyer } = await UserService.create({
        email: 'other@example.com',
        password: 'Test1234!',
      });

      await SalesOrder.createOrder({
        buyerId: buyer.id,
        items: [{ postId: SEEDED_POST_IDS[0], price: '10.00' }],
        shippingCost: '11.00',
        tracking: null,
      });
      await SalesOrder.createOrder({
        buyerId: otherBuyer.id,
        items: [{ postId: SEEDED_POST_IDS[1], price: '20.00' }],
        shippingCost: 0,
        tracking: null,
      });

      const resp = await buyerAgent.get('/api/v1/user-sales');

      expect(resp.status).toBe(200);
      expect(resp.body).toHaveLength(1);
      expect(resp.body[0].buyer_id).toBe(buyer.id);
      expect(resp.body[0].shipping_cost).toBe('11.00');
      expect(resp.body[0].items).toHaveLength(1);
      expect(resp.body[0].items[0].post_title).toBe('Test 1');
    });

    it('should return an empty array when the user has no orders', async () => {
      const [agent] = await registerAndLogin();

      const resp = await agent.get('/api/v1/user-sales');

      expect(resp.status).toBe(200);
      expect(resp.body).toEqual([]);
    });
  });
});

describe('SalesOrder model', () => {
  beforeEach(() => {
    return setup(pool);
  });

  it('createOrder writes one order row, one item row per piece, and marks each sold', async () => {
    const { user: buyer } = await UserService.create(mockBuyer);

    const order = await SalesOrder.createOrder({
      buyerId: buyer.id,
      items: [
        { postId: SEEDED_POST_IDS[0], price: '10.00' },
        { postId: SEEDED_POST_IDS[2], price: '30.00' },
      ],
      shippingCost: '11.00',
      tracking: 'XYZ789',
    });

    expect(order.buyer_id).toBe(buyer.id);
    expect(order.shipping_cost).toBe('11.00');
    expect(order.items.map((item) => item.post_id)).toEqual([
      SEEDED_POST_IDS[0],
      SEEDED_POST_IDS[2],
    ]);
    expect(await isPostSold(SEEDED_POST_IDS[0])).toBe(true);
    expect(await isPostSold(SEEDED_POST_IDS[1])).toBe(false);
    expect(await isPostSold(SEEDED_POST_IDS[2])).toBe(true);
  });

  it('createOrder rolls the whole transaction back when an item references a missing post', async () => {
    const { user: buyer } = await UserService.create(mockBuyer);

    await expect(
      SalesOrder.createOrder({
        buyerId: buyer.id,
        items: [
          { postId: SEEDED_POST_IDS[0], price: '10.00' },
          { postId: MISSING_POST_ID, price: '30.00' },
        ],
        shippingCost: 0,
        tracking: null,
      }),
    ).rejects.toThrow();

    expect(await countRows('sales_orders')).toBe(0);
    expect(await countRows('gallery_post_sales')).toBe(0);
    expect(await isPostSold(SEEDED_POST_IDS[0])).toBe(false);
  });

  it('getAllOrders still returns a buyer who has no profile row', async () => {
    const { user: buyer } = await UserService.create(mockBuyer);

    await SalesOrder.createOrder({
      buyerId: buyer.id,
      items: [{ postId: SEEDED_POST_IDS[0], price: '10.00' }],
      shippingCost: 0,
      tracking: null,
    });

    const orders = await SalesOrder.getAllOrders();

    expect(orders).toHaveLength(1);
    expect(orders[0].buyer_email).toBe(buyer.email);
    expect(orders[0].buyer_name).toBeNull();
    expect(orders[0].items).toHaveLength(1);
  });

  it('getOrderById returns null for an unknown id', async () => {
    expect(await SalesOrder.getOrderById(MISSING_POST_ID)).toBeNull();
  });

  it('getAllOrdersByUserId returns an empty array, not null, when the user has no orders', async () => {
    const { user: buyer } = await UserService.create(mockBuyer);

    expect(await SalesOrder.getAllOrdersByUserId(buyer.id)).toEqual([]);
  });
});
