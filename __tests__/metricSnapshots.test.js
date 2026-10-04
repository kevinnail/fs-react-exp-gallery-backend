const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');
const Profile = require('../lib/models/Profile');
const SalesOrder = require('../lib/models/SalesOrder');
const MetricSnapshot = require('../lib/models/MetricSnapshot');

const adminCredentials = { email: 'test@example.com', password: 'Test1234!' };

const createCustomer = async (email) => {
  const { user } = await UserService.create({ email, password: 'Test1234!' });
  await Profile.insert({ userId: user.id, firstName: 'Test', lastName: 'Customer' });
  return user;
};

const loginAsAdmin = async () => {
  const admin = await createCustomer(adminCredentials.email);
  const agent = request.agent(app);
  await agent.post('/api/v1/users/sessions').send(adminCredentials);
  return [agent, admin];
};

const setPost = async (postId, { price, discountedPrice = null, hide = false }) => {
  await pool.query(
    'UPDATE gallery_posts SET price = $2, discounted_price = $3, hide = $4 WHERE id = $1',
    [postId, price, discountedPrice, hide],
  );
};

const insertSnapshot = async ({ snapshotDate, reachableByEmail }) => {
  await pool.query(
    `
    INSERT INTO daily_metric_snapshots (
      snapshot_date, outstanding_gallery, outstanding_auction, reachable_by_email,
      inventory_for_sale_count, inventory_for_sale_value, hidden_post_count
    )
    VALUES ($1, 0, 0, $2, 0, 0, 0)
    `,
    [snapshotDate, reachableByEmail],
  );
};

const countSnapshotRows = async () => {
  const {
    rows: [row],
  } = await pool.query('SELECT COUNT(*)::int AS count FROM daily_metric_snapshots');
  return row.count;
};

afterAll(() => {
  pool.end();
});

describe('MetricSnapshot.captureToday', () => {
  beforeEach(async () => {
    await setup(pool);
  });

  it('leaves one row with the second values when captured twice on the same day', async () => {
    await setPost(1, { price: '100' });
    await MetricSnapshot.captureToday();
    await setPost(1, { price: '200' });

    const snapshot = await MetricSnapshot.captureToday();

    expect(await countSnapshotRows()).toBe(1);
    expect(snapshot.inventoryForSaleValue).toBe(200);
  });

  it('puts an unpaid auction win and an unpaid gallery order in their own outstanding columns', async () => {
    const buyer = await createCustomer('buyer@example.com');
    const {
      rows: [auction],
    } = await pool.query(
      `
      INSERT INTO auctions (title, image_urls, start_price, is_active, end_time, creator_id)
      VALUES ('Auction piece', '{}', 1, FALSE, NOW() - INTERVAL '1 day', $1)
      RETURNING id
      `,
      [buyer.id],
    );
    await pool.query(
      `
      INSERT INTO auction_results (auction_id, winner_id, final_bid, closed_reason, is_paid)
      VALUES ($1, $2, 40, 'expired', FALSE)
      `,
      [auction.id, buyer.id],
    );
    await SalesOrder.createOrder({
      buyerId: buyer.id,
      items: [{ postId: 1, price: 100 }],
      shippingCost: 15,
      tracking: null,
    });
    const paidOrder = await SalesOrder.createOrder({
      buyerId: buyer.id,
      items: [{ postId: 2, price: 500 }],
      shippingCost: 0,
      tracking: null,
    });
    await SalesOrder.updatePaidStatus(paidOrder.id, true);

    const snapshot = await MetricSnapshot.captureToday();

    expect(snapshot.outstandingGallery).toBe(115);
    expect(snapshot.outstandingAuction).toBe(40);
  });

  it('counts a hidden piece as hidden and not in for-sale value, and uses the discounted price', async () => {
    await setPost(1, { price: '120', discountedPrice: '90' });
    await setPost(2, { price: '50', hide: true });
    await setPost(3, { price: '30' });

    const snapshot = await MetricSnapshot.captureToday();

    expect(snapshot).toMatchObject({
      inventoryForSaleCount: 2,
      inventoryForSaleValue: 120,
      hiddenPostCount: 1,
    });
  });

  it('counts customers who accept promotional email as reachable', async () => {
    await createCustomer('reachable@example.com');
    const optedOut = await createCustomer('opted-out@example.com');
    await pool.query('UPDATE profiles SET email_promotions = FALSE WHERE user_id = $1', [
      optedOut.id,
    ]);

    const snapshot = await MetricSnapshot.captureToday();

    expect(snapshot.reachableByEmail).toBe(1);
  });

  it('counts a post priced "call" as 0 instead of failing the capture', async () => {
    await setPost(1, { price: 'call' });
    await setPost(2, { price: '75' });
    await setPost(3, { price: '$40' });

    const snapshot = await MetricSnapshot.captureToday();

    expect(snapshot.inventoryForSaleCount).toBe(3);
    expect(snapshot.inventoryForSaleValue).toBe(75);
  });
});

describe('GET /api/v1/admin/chart-series snapshot series', () => {
  beforeEach(async () => {
    await setup(pool);
  });

  it('takes the last snapshot in a week and returns null for a week with none', async () => {
    const [adminAgent, admin] = await loginAsAdmin();
    const order = await SalesOrder.createOrder({
      buyerId: admin.id,
      items: [{ postId: 1, price: 100 }],
      shippingCost: 0,
      tracking: null,
    });
    await pool.query("UPDATE sales_orders SET created_at = '2026-06-03 18:00:00' WHERE id = $1", [
      order.id,
    ]);
    await insertSnapshot({ snapshotDate: '2026-06-04', reachableByEmail: 5 });
    await insertSnapshot({ snapshotDate: '2026-06-05', reachableByEmail: 7 });

    const resp = await adminAgent
      .get('/api/v1/admin/chart-series')
      .query({ granularity: 'week', range: 'all' });

    expect(resp.status).toBe(200);
    const { buckets, series } = resp.body;
    expect(buckets[0]).toBe('2026-06-01');
    expect(series.reachableByEmail[0]).toBe(7);
    expect(series.reachableByEmail[1]).toBeNull();
    expect(series.outstandingGallery[1]).toBeNull();
    expect(series.valueForSale[1]).toBeNull();
  });
});
