const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const auctionTimers = require('../lib/jobs/auctionTimers');
const UserService = require('../lib/services/UserService');

// Message model creates encrypted rows, so leave its mock alone
jest.mock('../lib/models/Message');

global.wsService = {
  emitAuctionEnded: jest.fn(),
  emitUserWon: jest.fn(),
  io: { to: jest.fn(() => ({ emit: jest.fn() })) },
};

describe('auctionTimers sweepExpiredAuctions', () => {
  beforeEach(() => {
    return setup(pool);
  });

  afterAll(() => {
    jest.clearAllMocks();
    pool.end();
  });

  it('sweeps and finalizes expired auctions', async () => {
    // Create two users for FK references
    const { user: u1 } = await UserService.create({
      email: 'u1@test.com',
      password: '12345',
    });

    const { user: u2 } = await UserService.create({
      email: 'u2@test.com',
      password: '12345',
    });

    // Insert 2 expired auctions
    const { rows: auctions } = await pool.query(
      `
      INSERT INTO auctions (title, image_urls, start_price, is_active, end_time, creator_id)
      VALUES
        ('A1', '{}', 1, TRUE, NOW() - INTERVAL '10 minutes', $1),
        ('A2', '{}', 1, TRUE, NOW() - INTERVAL '20 minutes', $2)
      RETURNING id
      `,
      [u1.id, u2.id],
    );

    const a1 = auctions[0].id;
    const a2 = auctions[1].id;

    // Create bids for each auction
    await pool.query(
      `
      INSERT INTO bids (auction_id, user_id, bid_amount)
      VALUES
        ($1, $2, 50),
        ($3, $4, 80)
      `,
      [a1, u1.id, a2, u2.id],
    );

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // Run the real sweep
    await auctionTimers.sweepExpiredAuctions();

    // Auctions should be inactive now
    const { rows: updated } = await pool.query(
      `
      SELECT id, is_active FROM auctions 
      WHERE id = ANY($1) 
      ORDER BY id
      `,
      [[a1, a2]],
    );

    expect(updated).toEqual([
      { id: a1, is_active: false },
      { id: a2, is_active: false },
    ]);

    // Results table should have one row per auction
    const { rows: res } = await pool.query(
      `
      SELECT auction_id FROM auction_results 
      WHERE auction_id = ANY($1) 
      ORDER BY auction_id
      `,
      [[a1, a2]],
    );

    expect(res).toEqual([{ auction_id: Number(a1) }, { auction_id: Number(a2) }]);

    // Notifications table should get one row per winner
    const { rows: notifs } = await pool.query(
      `
      SELECT auction_id FROM auction_notifications 
      ORDER BY auction_id
      `,
    );

    expect(notifs).toEqual([{ auction_id: a1 }, { auction_id: a2 }]);

    // Sweep log is called once with proper text
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Sweep processed 2 expired auctions'),
    );

    logSpy.mockRestore();
  });

  it('handles case with no expired auctions', async () => {
    const { user } = await UserService.create({
      email: 'future@test.com',
      password: '12345',
    });

    // Create an active auction that is NOT expired
    await pool.query(
      `
      INSERT INTO auctions (title, image_urls, start_price, is_active, end_time, creator_id)
      VALUES ('future', '{}', 1, TRUE, NOW() + INTERVAL '15 minutes', $1)
      `,
      [user.id],
    );

    global.wsService.emitAuctionEnded.mockClear();

    await auctionTimers.sweepExpiredAuctions();

    expect(global.wsService.emitAuctionEnded).not.toHaveBeenCalled();
  });

  it('logs an error when sweep query fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Break ONLY the SELECT inside sweepExpiredAuctions
    await pool.query(`
      DROP TABLE IF EXISTS auctions_broken CASCADE
      ;`);

    await pool.query(`
      ALTER TABLE auctions RENAME TO auctions_broken
      `);

    // This will now fail at the SELECT in sweepExpiredAuctions
    await auctionTimers.sweepExpiredAuctions();

    expect(spy).toHaveBeenCalledWith('[Cron] Sweep error', expect.any(Error));

    // Restore schema so the rest of the suite stays clean
    await pool.query(`
      ALTER TABLE auctions_broken RENAME TO auctions
      `);

    spy.mockRestore();
  });
});
