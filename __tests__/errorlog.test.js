const pool = require('../lib/utils/pool');
const ErrorLog = require('../lib/models/ErrorLog');

describe('ErrorLog model', () => {
  beforeEach(async () => {
    await pool.query('DELETE FROM error_logs');
  });

  afterAll(() => pool.end());

  it('logs and retrieves errors', async () => {
    await ErrorLog.log('Test error', 'unit test context');
    const logs = await ErrorLog.getAll();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].error).toBe('Test error');
    expect(logs[0].context).toBe('unit test context');
  });

  it('limits results', async () => {
    for (let i = 0; i < 5; i++) {
      await ErrorLog.log(`Error ${i}`);
    }
    const logs = await ErrorLog.getAll(3);
    expect(logs.length).toBe(3);
  });
});
