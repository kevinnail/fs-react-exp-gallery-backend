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

// Timestamps are written as explicit UTC values so the test does not depend
// on the database session timezone.
const insertOrderAt = async ({ buyerId, items, shippingCost, createdAtUtc }) => {
  const order = await SalesOrder.createOrder({ buyerId, items, shippingCost, tracking: null });
  await pool.query('UPDATE sales_orders SET created_at = $2 WHERE id = $1', [
    order.id,
    createdAtUtc,
  ]);
};

const insertAuctionWinAt = async ({ creatorId, winnerId, finalBid, closedAtUtc }) => {
  const {
    rows: [auction],
  } = await pool.query(
    `
    INSERT INTO auctions (title, image_urls, start_price, is_active, end_time, creator_id)
    VALUES ('Auction piece', '{}', 1, FALSE, NOW() - INTERVAL '1 day', $1)
    RETURNING id
    `,
    [creatorId],
  );
  await pool.query(
    `
    INSERT INTO auction_results (auction_id, winner_id, final_bid, closed_reason, closed_at)
    VALUES ($1, $2, $3, 'expired', $4)
    `,
    [auction.id, winnerId, finalBid, closedAtUtc],
  );
};

const currentPacificBucket = async (granularity) => {
  const {
    rows: [row],
  } = await pool.query(
    "SELECT to_char(date_trunc($1::text, NOW() AT TIME ZONE 'America/Los_Angeles'), 'YYYY-MM-DD') AS bucket",
    [granularity],
  );
  return row.bucket;
};

const fetchChartSeries = async (agent, query) => {
  const resp = await agent.get('/api/v1/admin/chart-series').query(query);
  expect(resp.status).toBe(200);
  return resp.body;
};

const valueAt = (chartSeries, seriesName, bucket) =>
  chartSeries.series[seriesName][chartSeries.buckets.indexOf(bucket)];

describe('GET /api/v1/admin/chart-series', () => {
  beforeEach(async () => {
    await setup(pool);
  });

  afterAll(() => {
    pool.end();
  });

  it('counts a two-item order in its week with shipping added once', async () => {
    const [adminAgent] = await loginAsAdmin();
    const buyer = await createCustomer('buyer@example.com');
    // Wednesday 2026-06-03, 11am Pacific
    await insertOrderAt({
      buyerId: buyer.id,
      items: [
        { postId: 1, price: 100 },
        { postId: 2, price: 50 },
      ],
      shippingCost: 20,
      createdAtUtc: '2026-06-03 18:00:00',
    });

    const chartSeries = await fetchChartSeries(adminAgent, { granularity: 'week', range: 'all' });

    expect(chartSeries.granularity).toBe('week');
    expect(chartSeries.currentBucketIsPartial).toBe(true);
    expect(chartSeries.buckets[0]).toBe('2026-06-01');
    expect(valueAt(chartSeries, 'galleryRevenue', '2026-06-01')).toBe(170);
    expect(valueAt(chartSeries, 'auctionRevenue', '2026-06-01')).toBe(0);
  });

  it('counts an auction win in the bucket of its closed_at', async () => {
    const [adminAgent, admin] = await loginAsAdmin();
    const buyer = await createCustomer('buyer@example.com');
    // Wednesday 2026-06-10, 11am Pacific
    await insertAuctionWinAt({
      creatorId: admin.id,
      winnerId: buyer.id,
      finalBid: 80,
      closedAtUtc: '2026-06-10 18:00:00',
    });

    const chartSeries = await fetchChartSeries(adminAgent, { granularity: 'week', range: 'all' });

    expect(chartSeries.buckets[0]).toBe('2026-06-08');
    expect(valueAt(chartSeries, 'auctionRevenue', '2026-06-08')).toBe(80);
    expect(valueAt(chartSeries, 'galleryRevenue', '2026-06-08')).toBe(0);
  });

  it('fills a week with no sales with 0 and returns one bucket per week through today', async () => {
    const [adminAgent] = await loginAsAdmin();
    const buyer = await createCustomer('buyer@example.com');
    await insertOrderAt({
      buyerId: buyer.id,
      items: [{ postId: 1, price: 100 }],
      shippingCost: 0,
      createdAtUtc: '2026-06-03 18:00:00',
    });
    await insertOrderAt({
      buyerId: buyer.id,
      items: [{ postId: 2, price: 40 }],
      shippingCost: 0,
      createdAtUtc: '2026-06-17 18:00:00',
    });

    const chartSeries = await fetchChartSeries(adminAgent, { granularity: 'week', range: 'all' });

    expect(chartSeries.buckets.slice(0, 3)).toEqual(['2026-06-01', '2026-06-08', '2026-06-15']);
    expect(chartSeries.series.galleryRevenue.slice(0, 3)).toEqual([100, 0, 40]);

    const weekInMilliseconds = 7 * 24 * 60 * 60 * 1000;
    const firstWeek = Date.parse(chartSeries.buckets[0]);
    const lastWeek = Date.parse(await currentPacificBucket('week'));
    const expectedWeekCount = Math.round((lastWeek - firstWeek) / weekInMilliseconds) + 1;

    expect(chartSeries.buckets).toHaveLength(expectedWeekCount);
    expect(chartSeries.buckets.at(-1)).toBe(await currentPacificBucket('week'));
    expect(chartSeries.series.galleryRevenue).toHaveLength(expectedWeekCount);
    expect(chartSeries.series.auctionRevenue).toHaveLength(expectedWeekCount);
  });

  it('puts an order at 11pm Pacific on the last day of a month in that month', async () => {
    const [adminAgent] = await loginAsAdmin();
    const buyer = await createCustomer('buyer@example.com');
    // 2026-08-01 06:00 UTC is 2026-07-31 11pm Pacific
    await insertOrderAt({
      buyerId: buyer.id,
      items: [{ postId: 1, price: 100 }],
      shippingCost: 0,
      createdAtUtc: '2026-08-01 06:00:00',
    });

    const chartSeries = await fetchChartSeries(adminAgent, { granularity: 'month', range: 'all' });

    expect(chartSeries.buckets[0]).toBe('2026-07-01');
    expect(valueAt(chartSeries, 'galleryRevenue', '2026-07-01')).toBe(100);
    expect(valueAt(chartSeries, 'galleryRevenue', '2026-08-01')).toBe(0);
  });

  it('returns 400 for an unknown granularity', async () => {
    const [adminAgent] = await loginAsAdmin();

    const resp = await adminAgent
      .get('/api/v1/admin/chart-series')
      .query({ granularity: 'year', range: '6m' });

    expect(resp.status).toBe(400);
    expect(resp.body.message).toBe('granularity must be day, week or month');
  });

  it('returns 400 for an unknown range', async () => {
    const [adminAgent] = await loginAsAdmin();

    const resp = await adminAgent
      .get('/api/v1/admin/chart-series')
      .query({ granularity: 'week', range: '5y' });

    expect(resp.status).toBe(400);
    expect(resp.body.message).toBe('range must be 3m, 6m, 12m or all');
  });

  it('returns 400 for day granularity over all time', async () => {
    const [adminAgent] = await loginAsAdmin();

    const resp = await adminAgent
      .get('/api/v1/admin/chart-series')
      .query({ granularity: 'day', range: 'all' });

    expect(resp.status).toBe(400);
    expect(resp.body.message).toBe('day granularity needs a range of 12 months or less');
  });

  it('returns 403 for a signed-in non-admin', async () => {
    const customerCredentials = { email: 'regular@example.com', password: 'Test1234!' };
    await createCustomer(customerCredentials.email);
    const customerAgent = await loginAs(customerCredentials);

    const resp = await customerAgent
      .get('/api/v1/admin/chart-series')
      .query({ granularity: 'week', range: '6m' });

    expect(resp.status).toBe(403);
  });
});
