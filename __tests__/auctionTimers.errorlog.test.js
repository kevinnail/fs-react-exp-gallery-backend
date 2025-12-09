const setup = require('../data/setup.js');
const auctionTimers = require('../lib/jobs/auctionTimers');
const ErrorLog = require('../lib/models/ErrorLog');
const pool = require('../lib/utils/pool');
const db = require('../lib/utils/pool');

jest.mock('../lib/models/ErrorLog');

const originalQuery = db.query;
beforeEach(() => {
  return setup(pool);
});

afterEach(() => {
  jest.clearAllMocks();
  db.query = originalQuery;
  jest.useRealTimers();
});

it('logs error if sweepExpiredAuctions throws', async () => {
  db.query = jest.fn().mockRejectedValue(new Error('DB fail'));
  ErrorLog.log.mockResolvedValue();
  await auctionTimers.sweepExpiredAuctions();
  expect(ErrorLog.log).toHaveBeenCalledWith('DB fail', 'sweepExpiredAuctions');
});

// ^ not a working/ passing test yet- can't get the error to trigger....
//^ iterated too many times getting nowhere.  Tried extracting the callback in auctionsTimers
// ^ so it was directly accessible but nothing is touching it- 'Number of calls: 0" is all she wrote
// it('logs error if scheduleAuctionEnd timer throws');
