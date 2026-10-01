const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');
const Profile = require('../lib/models/Profile');
const SalesOrder = require('../lib/models/SalesOrder');

const adminCredentials = { email: 'test@example.com', password: 'Test1234!' };

const createCustomer = async (email) => {
  const { user } = await UserService.create({ email, password: 'Test1234!' });
  await Profile.insert({ userId: user.id, firstName: 'Test', lastName: 'Customer' });
  return user;
};

const loginAs = async (credentials) => {
  const agent = request.agent(app);
  await agent.post('/api/v1/users/sessions').send(credentials);
  return agent;
};

const loginAsAdmin = async () => {
  const admin = await createCustomer(adminCredentials.email);
  const agent = await loginAs(adminCredentials);
  return [agent, admin];
};

const insertAuction = async (creatorId) => {
  const { rows } = await pool.query(
    `
    INSERT INTO auctions (title, image_urls, start_price, is_active, end_time, creator_id)
    VALUES ('Auction piece', '{}', 1, FALSE, NOW() - INTERVAL '1 day', $1)
    RETURNING id
    `,
    [creatorId],
  );
  return rows[0].id;
};

const insertAuctionWin = async ({ auctionId, winnerId, finalBid, isPaid }) => {
  await pool.query(
    `
    INSERT INTO auction_results (auction_id, winner_id, final_bid, closed_reason, is_paid)
    VALUES ($1, $2, $3, 'expired', $4)
    `,
    [auctionId, winnerId, finalBid, isPaid],
  );
};

const fetchCustomers = async (agent) => {
  const resp = await agent.get('/api/v1/admin/customers');
  expect(resp.status).toBe(200);
  return resp.body;
};

const rowFor = (customers, email) => customers.find((customer) => customer.email === email);

describe('GET /api/v1/admin/customers', () => {
  beforeEach(async () => {
    await setup(pool);
  });

  afterAll(() => {
    pool.end();
  });

  it('adds shipping once per order, not once per item', async () => {
    const [adminAgent] = await loginAsAdmin();
    const buyer = await createCustomer('buyer@example.com');
    const order = await SalesOrder.createOrder({
      buyerId: buyer.id,
      items: [
        { postId: 1, price: 100 },
        { postId: 2, price: 50 },
      ],
      shippingCost: 20,
      tracking: null,
    });
    await SalesOrder.updatePaidStatus(order.id, true);

    const buyerRow = rowFor(await fetchCustomers(adminAgent), 'buyer@example.com');

    expect(buyerRow).toMatchObject({
      orderCount: 1,
      itemCount: 2,
      auctionsWon: 0,
      gross: 170,
      collected: 170,
      outstanding: 0,
      largestOrder: 170,
      grossLast30Days: 170,
    });
    expect(buyerRow.firstPurchaseAt).not.toBeNull();
  });

  it('adds an auction win to the same customer as their gallery orders', async () => {
    const [adminAgent, admin] = await loginAsAdmin();
    const buyer = await createCustomer('buyer@example.com');
    const order = await SalesOrder.createOrder({
      buyerId: buyer.id,
      items: [{ postId: 1, price: 100 }],
      shippingCost: 0,
      tracking: null,
    });
    await SalesOrder.updatePaidStatus(order.id, true);
    const auctionId = await insertAuction(admin.id);
    await insertAuctionWin({ auctionId, winnerId: buyer.id, finalBid: 80, isPaid: true });

    const buyerRow = rowFor(await fetchCustomers(adminAgent), 'buyer@example.com');

    expect(buyerRow).toMatchObject({
      orderCount: 2,
      itemCount: 2,
      auctionsWon: 1,
      gross: 180,
      collected: 180,
      largestOrder: 100,
    });
  });

  it('returns a row of zeroes for a customer with no activity', async () => {
    const [adminAgent] = await loginAsAdmin();
    await createCustomer('browser@example.com');

    const browserRow = rowFor(await fetchCustomers(adminAgent), 'browser@example.com');

    expect(browserRow).toMatchObject({
      orderCount: 0,
      itemCount: 0,
      auctionsWon: 0,
      gross: 0,
      collected: 0,
      outstanding: 0,
      largestOrder: 0,
      bidCount: 0,
      auctionsBidOn: 0,
      messageCount: 0,
      hasAddress: false,
      firstPurchaseAt: null,
      lastPurchaseAt: null,
    });
    expect(browserRow.joinedAt).not.toBeNull();
  });

  it('counts bids on an auction the customer did not win', async () => {
    const [adminAgent, admin] = await loginAsAdmin();
    const bidder = await createCustomer('bidder@example.com');
    const auctionId = await insertAuction(admin.id);
    await pool.query(
      'INSERT INTO bids (auction_id, user_id, bid_amount) VALUES ($1, $2, 10), ($1, $2, 20)',
      [auctionId, bidder.id],
    );

    const bidderRow = rowFor(await fetchCustomers(adminAgent), 'bidder@example.com');

    expect(bidderRow).toMatchObject({ bidCount: 2, auctionsBidOn: 1, auctionsWon: 0 });
  });

  it('counts unpaid orders and wins toward outstanding, not collected', async () => {
    const [adminAgent, admin] = await loginAsAdmin();
    const buyer = await createCustomer('buyer@example.com');
    await SalesOrder.createOrder({
      buyerId: buyer.id,
      items: [{ postId: 1, price: 100 }],
      shippingCost: 15,
      tracking: null,
    });
    const auctionId = await insertAuction(admin.id);
    await insertAuctionWin({ auctionId, winnerId: buyer.id, finalBid: 40, isPaid: false });

    const buyerRow = rowFor(await fetchCustomers(adminAgent), 'buyer@example.com');

    expect(buyerRow).toMatchObject({ gross: 155, collected: 0, outstanding: 155 });
  });

  it('returns 403 for a signed-in non-admin', async () => {
    const customerCredentials = { email: 'regular@example.com', password: 'Test1234!' };
    await createCustomer(customerCredentials.email);
    const customerAgent = await loginAs(customerCredentials);

    const resp = await customerAgent.get('/api/v1/admin/customers');

    expect(resp.status).toBe(403);
  });

  it('returns 401 when not signed in', async () => {
    const resp = await request(app).get('/api/v1/admin/customers');

    expect(resp.status).toBe(401);
  });
});
