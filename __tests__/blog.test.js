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

  describe('PUT and GET /api/v1/admin/blog/:id', () => {
    const textBlocks = [
      { id: 'block-a', type: 'text', body: 'Trailhead at dawn.' },
      { id: 'block-b', type: 'text', body: 'The **ridge** above camp.' },
      { id: 'block-c', type: 'text', body: '' },
    ];

    const createDraft = async (agent) => {
      const resp = await agent
        .post('/api/v1/admin/blog')
        .send({ title: 'Ridge Hike', category: 'Hiking' });
      return resp.body;
    };

    const storedRow = async (id) => {
      const { rows } = await pool.query('SELECT * FROM blog_posts WHERE id = $1', [id]);
      return rows[0];
    };

    it('saves title, category and blocks, and GET returns blocks in the same order', async () => {
      const [agent] = await registerAndLogin();
      const draft = await createDraft(agent);
      const reordered = [textBlocks[2], textBlocks[0], textBlocks[1]];
      await pool.query("UPDATE blog_posts SET updated_at = '2026-01-01' WHERE id = $1", [draft.id]);

      const putResp = await agent
        .put(`/api/v1/admin/blog/${draft.id}`)
        .send({ title: 'Ridge Hike, Day Two', category: 'Backpacking', blocks: reordered });

      expect(putResp.status).toBe(200);
      expect(putResp.body.title).toBe('Ridge Hike, Day Two');
      expect(putResp.body.category).toBe('Backpacking');

      const getResp = await agent.get(`/api/v1/admin/blog/${draft.id}`);
      expect(getResp.status).toBe(200);
      expect(getResp.body.blocks).toEqual(reordered);
      // The slug is fixed at creation so shared links survive title edits.
      expect(getResp.body.slug).toBe('ridge-hike');
      expect((await storedRow(draft.id)).updated_at.getTime()).toBeGreaterThan(
        new Date('2026-01-01').getTime(),
      );
    });

    it('reuses another post category case-insensitively but lets a post fix its own case', async () => {
      const [agent] = await registerAndLogin();
      await agent.post('/api/v1/admin/blog').send({ title: 'Glass day', category: 'Glass' });
      const draft = await createDraft(agent);

      const joined = await agent
        .put(`/api/v1/admin/blog/${draft.id}`)
        .send({ title: 'Ridge Hike', category: 'glass', blocks: [] });
      expect(joined.body.category).toBe('Glass');

      const solo = await agent
        .post('/api/v1/admin/blog')
        .send({ title: 'Telescope', category: 'astro' });
      const recased = await agent
        .put(`/api/v1/admin/blog/${solo.body.id}`)
        .send({ title: 'Telescope', category: 'Astro', blocks: [] });
      expect(recased.body.category).toBe('Astro');
    });

    it('returns 400 for a block missing its type and leaves the row unchanged', async () => {
      const [agent] = await registerAndLogin();
      const draft = await createDraft(agent);
      await agent
        .put(`/api/v1/admin/blog/${draft.id}`)
        .send({ title: 'Ridge Hike', category: 'Hiking', blocks: textBlocks });

      const resp = await agent.put(`/api/v1/admin/blog/${draft.id}`).send({
        title: 'Should not save',
        category: 'Hiking',
        blocks: [{ id: 'block-x', body: 'No type' }],
      });

      expect(resp.status).toBe(400);
      expect(resp.body.message).toBe('Block 1 has an unknown type');
      const row = await storedRow(draft.id);
      expect(row.title).toBe('Ridge Hike');
      expect(row.blocks).toEqual(textBlocks);
    });

    it('returns 400 for a text block whose body is not a string', async () => {
      const [agent] = await registerAndLogin();
      const draft = await createDraft(agent);

      const resp = await agent.put(`/api/v1/admin/blog/${draft.id}`).send({
        title: 'Ridge Hike',
        category: 'Hiking',
        blocks: [{ id: 'block-x', type: 'text', body: 42 }],
      });

      expect(resp.status).toBe(400);
      expect(resp.body.message).toBe('Block 1 text must be a string');
      expect((await storedRow(draft.id)).blocks).toEqual([]);
    });

    it('returns 404 for an unknown id on GET and PUT', async () => {
      const [agent] = await registerAndLogin();

      const getResp = await agent.get('/api/v1/admin/blog/999999');
      const putResp = await agent
        .put('/api/v1/admin/blog/999999')
        .send({ title: 'Ghost', category: 'General', blocks: [] });

      expect(getResp.status).toBe(404);
      expect(putResp.status).toBe(404);
    });

    it('returns 403 for a customer PUT and leaves the row unchanged', async () => {
      const [adminAgent] = await registerAndLogin();
      const draft = await createDraft(adminAgent);
      const [customerAgent] = await registerAndLogin({ email: 'customer@example.com' });

      const resp = await customerAgent
        .put(`/api/v1/admin/blog/${draft.id}`)
        .send({ title: 'Hijacked', category: 'General', blocks: [] });

      expect(resp.status).toBe(403);
      expect((await storedRow(draft.id)).title).toBe('Ridge Hike');
    });
  });
});
