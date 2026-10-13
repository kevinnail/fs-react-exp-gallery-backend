const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');

// test@example.com is configured as an admin (in ALLOWED_EMAILS) for the test env
const adminUser = { email: 'test@example.com', password: 'Test1234!' };

const registerAndLogin = async (userOverrides = {}) => {
  const agent = request.agent(app);
  const userData = { ...adminUser, ...userOverrides };
  const { user } = await UserService.create(userData);
  await agent
    .post('/api/v1/users/sessions')
    .send({ email: userData.email, password: userData.password });
  return [agent, user];
};

const blogRowCount = async () => {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM blog_posts');
  return rows[0].count;
};

describe('admin blog routes', () => {
  beforeEach(() => {
    return setup(pool);
  });

  afterAll(() => {
    pool.end();
  });

  describe('POST /api/v1/admin/blog', () => {
    it('creates a draft with a slug built from the title', async () => {
      const [agent] = await registerAndLogin();
      const resp = await agent
        .post('/api/v1/admin/blog')
        .send({ title: '  Sunrise on the Ridge!  ', category: 'hiking' });

      expect(resp.status).toBe(200);
      expect(resp.body).toEqual({
        id: expect.any(String),
        slug: 'sunrise-on-the-ridge',
        title: 'Sunrise on the Ridge!',
        category: 'hiking',
        blocks: [],
        publishedAt: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      const { rows } = await pool.query('SELECT * FROM blog_posts WHERE id = $1', [resp.body.id]);
      expect(rows[0].slug).toBe('sunrise-on-the-ridge');
      expect(rows[0].published_at).toBeNull();
    });

    it('suffixes the slug when the title is already taken', async () => {
      const [agent] = await registerAndLogin();
      const first = await agent
        .post('/api/v1/admin/blog')
        .send({ title: 'Ridge Hike', category: 'hiking' });
      const second = await agent
        .post('/api/v1/admin/blog')
        .send({ title: 'Ridge Hike', category: 'hiking' });
      const third = await agent
        .post('/api/v1/admin/blog')
        .send({ title: 'ridge hike', category: 'astronomy' });

      expect(first.body.slug).toBe('ridge-hike');
      expect(second.body.slug).toBe('ridge-hike-2');
      expect(third.body.slug).toBe('ridge-hike-3');
    });

    it('accepts any new category, trimmed', async () => {
      const [agent] = await registerAndLogin();
      const resp = await agent
        .post('/api/v1/admin/blog')
        .send({ title: 'New album', category: '  Music  ' });

      expect(resp.status).toBe(200);
      expect(resp.body.category).toBe('Music');
    });

    it('reuses an existing category when the new one differs only in case', async () => {
      const [agent] = await registerAndLogin();
      await agent.post('/api/v1/admin/blog').send({ title: 'First hike', category: 'Hiking' });
      const resp = await agent
        .post('/api/v1/admin/blog')
        .send({ title: 'Second hike', category: 'hiking' });

      expect(resp.body.category).toBe('Hiking');
      const { rows } = await pool.query('SELECT DISTINCT category FROM blog_posts');
      expect(rows).toEqual([{ category: 'Hiking' }]);
    });

    it('returns 400 for a missing or blank category and creates nothing', async () => {
      const [agent] = await registerAndLogin();
      const missing = await agent.post('/api/v1/admin/blog').send({ title: 'Glass notes' });
      const blank = await agent
        .post('/api/v1/admin/blog')
        .send({ title: 'Glass notes', category: '   ' });

      expect(missing.status).toBe(400);
      expect(blank.status).toBe(400);
      expect(blank.body.message).toBe('Category is required');
      expect(await blogRowCount()).toBe(0);
    });

    it('returns 400 for a missing title and for a title with no letters or numbers', async () => {
      const [agent] = await registerAndLogin();
      const missing = await agent.post('/api/v1/admin/blog').send({ category: 'tech' });
      const punctuationOnly = await agent
        .post('/api/v1/admin/blog')
        .send({ title: '!!! ???', category: 'tech' });

      expect(missing.status).toBe(400);
      expect(punctuationOnly.status).toBe(400);
      expect(await blogRowCount()).toBe(0);
    });

    it('returns 403 for a signed-in customer', async () => {
      const [agent] = await registerAndLogin({ email: 'customer@example.com' });
      const resp = await agent
        .post('/api/v1/admin/blog')
        .send({ title: 'Not mine', category: 'tech' });

      expect(resp.status).toBe(403);
      expect(await blogRowCount()).toBe(0);
    });

    it('returns 401 when signed out', async () => {
      const resp = await request(app)
        .post('/api/v1/admin/blog')
        .send({ title: 'Anonymous', category: 'tech' });

      expect(resp.status).toBe(401);
      expect(await blogRowCount()).toBe(0);
    });
  });

  describe('GET /api/v1/admin/blog', () => {
    it('lists drafts first, then published posts newest first', async () => {
      const [agent] = await registerAndLogin();
      const draft = await agent
        .post('/api/v1/admin/blog')
        .send({ title: 'Draft post', category: 'tech' });
      const olderPublished = await agent
        .post('/api/v1/admin/blog')
        .send({ title: 'Older published', category: 'hiking' });
      const newerPublished = await agent
        .post('/api/v1/admin/blog')
        .send({ title: 'Newer published', category: 'astronomy' });

      // Publishing arrives in slice 3; set the dates directly to exercise the ordering.
      await pool.query("UPDATE blog_posts SET published_at = '2026-01-01' WHERE id = $1", [
        olderPublished.body.id,
      ]);
      await pool.query("UPDATE blog_posts SET published_at = '2026-06-01' WHERE id = $1", [
        newerPublished.body.id,
      ]);

      const resp = await agent.get('/api/v1/admin/blog');

      expect(resp.status).toBe(200);
      expect(resp.body.map((post) => post.slug)).toEqual([
        'draft-post',
        'newer-published',
        'older-published',
      ]);
      expect(resp.body[0]).toEqual(
        expect.objectContaining({ id: draft.body.id, title: 'Draft post', publishedAt: null }),
      );
      expect(resp.body[1].publishedAt).not.toBeNull();
    });

    it('returns 403 for a signed-in customer', async () => {
      const [agent] = await registerAndLogin({ email: 'customer@example.com' });
      const resp = await agent.get('/api/v1/admin/blog');

      expect(resp.status).toBe(403);
    });
  });
});
