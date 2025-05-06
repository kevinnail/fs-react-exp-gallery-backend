const request = require('supertest');
const app = require('../lib/app');
const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
describe('rate limiting', () => {
  beforeEach(() => {
    return setup(pool);
  });

  afterAll(() => {
    jest.clearAllMocks();
    pool.end();
  });
  it('should allow requests within the rate limit', async () => {
    // Make multiple requests within the limit
    for (let i = 0; i < 5; i++) {
      const response = await request(app).get('/api/v1/main-gallery');
      expect(response.status).toBe(200);
    }
  });

  it('should block requests when rate limit is exceeded', async () => {
    // Make requests until we hit the rate limit
    let response;
    let requestCount = 0;

    // Keep making requests until we get a 429 or hit a reasonable maximum
    while (requestCount < 200) {
      response = await request(app).get('/api/v1/main-gallery');
      requestCount++;

      if (response.status === 429) {
        break;
      }
    }

    // Verify we got rate limited
    expect(response.status).toBe(429);
    expect(response.body).toEqual({
      code: 429,
      message: 'Too many requests, slow down.',
    });
  });
});
