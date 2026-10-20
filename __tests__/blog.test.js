const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');

jest.mock('@aws-sdk/client-s3', () => {
  const send = jest.fn().mockResolvedValue({});
  return {
    S3Client: jest.fn(() => ({ send })),
    PutObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
  };
});
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

// This file sends more than the test limiter's 150 requests a minute; rate-limit.test.js covers the limiter.
jest.mock('express-rate-limit', () => () => (req, res, next) => next());

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
    jest.clearAllMocks();
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
        summary: '',
        coverImageUrl: null,
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

    it('returns 404 for an unknown id even when the blocks reference images', async () => {
      const [agent] = await registerAndLogin();

      const resp = await agent.put('/api/v1/admin/blog/999999').send({
        title: 'Ghost',
        category: 'General',
        blocks: [{ id: 'block-a', type: 'images', images: [{ imageId: '1', caption: '' }] }],
      });

      expect(resp.status).toBe(404);
      expect(resp.body.message).toBe('Blog post not found');
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

  describe('publishing and the public blog', () => {
    const createDraft = async (agent, { title, category, body }) => {
      const created = await agent.post('/api/v1/admin/blog').send({ title, category });
      await agent.put(`/api/v1/admin/blog/${created.body.id}`).send({
        title,
        category,
        summary: 'Two days out and back.',
        blocks: [{ id: 'block-a', type: 'text', body }],
      });
      return created.body;
    };

    it('hides a draft from the public list and its slug until it is published', async () => {
      const [agent] = await registerAndLogin();
      const draft = await createDraft(agent, {
        title: 'Ridge Hike',
        category: 'Hiking',
        body: 'We hit the **ridge** at [sunrise](https://example.com).',
      });

      const draftList = await request(app).get('/api/v1/blog');
      const draftBySlug = await request(app).get('/api/v1/blog/ridge-hike');
      expect(draftList.status).toBe(200);
      expect(draftList.body).toEqual([]);
      expect(draftBySlug.status).toBe(404);

      const publishResp = await agent.patch(`/api/v1/admin/blog/${draft.id}/publish`);
      expect(publishResp.status).toBe(200);
      expect(publishResp.body.publishedAt).not.toBeNull();

      const publishedList = await request(app).get('/api/v1/blog');
      expect(publishedList.body).toEqual([
        {
          id: draft.id,
          slug: 'ridge-hike',
          title: 'Ridge Hike',
          category: 'Hiking',
          summary: 'Two days out and back.',
          coverImageUrl: null,
          publishedAt: publishResp.body.publishedAt,
        },
      ]);

      const publishedBySlug = await request(app).get('/api/v1/blog/ridge-hike');
      expect(publishedBySlug.status).toBe(200);
      expect(publishedBySlug.body.title).toBe('Ridge Hike');
      expect(publishedBySlug.body.blocks).toEqual([
        {
          id: 'block-a',
          type: 'text',
          body: 'We hit the **ridge** at [sunrise](https://example.com).',
        },
      ]);
    });

    it('lists published posts newest first', async () => {
      const [agent] = await registerAndLogin();
      const older = await createDraft(agent, { title: 'Older', category: 'Glass', body: 'a' });
      const newer = await createDraft(agent, { title: 'Newer', category: 'Tech', body: 'b' });
      await agent.patch(`/api/v1/admin/blog/${older.id}/publish`);
      await agent.patch(`/api/v1/admin/blog/${newer.id}/publish`);
      await pool.query("UPDATE blog_posts SET published_at = '2026-01-01' WHERE id = $1", [
        older.id,
      ]);

      const resp = await request(app).get('/api/v1/blog');

      expect(resp.body.map((post) => post.slug)).toEqual(['newer', 'older']);
    });

    it('keeps the original publish date when a post is published again', async () => {
      const [agent] = await registerAndLogin();
      const draft = await createDraft(agent, {
        title: 'Ridge Hike',
        category: 'Hiking',
        body: 'a',
      });
      await agent.patch(`/api/v1/admin/blog/${draft.id}/publish`);
      await pool.query("UPDATE blog_posts SET published_at = '2026-01-01' WHERE id = $1", [
        draft.id,
      ]);

      const resp = await agent.patch(`/api/v1/admin/blog/${draft.id}/publish`);

      expect(resp.status).toBe(200);
      const { rows } = await pool.query('SELECT published_at FROM blog_posts WHERE id = $1', [
        draft.id,
      ]);
      expect(rows[0].published_at.getTime()).toBe(new Date('2026-01-01T00:00:00').getTime());
    });

    it('returns 404 when publishing an unknown id', async () => {
      const [agent] = await registerAndLogin();
      const resp = await agent.patch('/api/v1/admin/blog/999999/publish');

      expect(resp.status).toBe(404);
    });

    it('returns 403 when a customer tries to publish, and the post stays a draft', async () => {
      const [adminAgent] = await registerAndLogin();
      const draft = await createDraft(adminAgent, {
        title: 'Ridge Hike',
        category: 'Hiking',
        body: 'a',
      });
      const [customerAgent] = await registerAndLogin({ email: 'customer@example.com' });

      const resp = await customerAgent.patch(`/api/v1/admin/blog/${draft.id}/publish`);

      expect(resp.status).toBe(403);
      expect((await request(app).get('/api/v1/blog/ridge-hike')).status).toBe(404);
    });
  });

  describe('blog images', () => {
    const imageBytes = Buffer.from('not really a jpeg, S3 is mocked');

    const createDraft = async (agent, title = 'Ridge Hike') => {
      const resp = await agent.post('/api/v1/admin/blog').send({ title, category: 'Hiking' });
      return resp.body;
    };

    const uploadImages = (agent, postId, fileNames) => {
      let uploadRequest = agent.post(`/api/v1/admin/blog/${postId}/images`);
      for (const fileName of fileNames) {
        uploadRequest = uploadRequest.attach('imageFiles', imageBytes, {
          filename: fileName,
          contentType: 'image/jpeg',
        });
      }
      return uploadRequest;
    };

    const imageRowsFor = async (postId) => {
      const { rows } = await pool.query(
        'SELECT id, public_id FROM blog_images WHERE post_id = $1 ORDER BY id',
        [postId],
      );
      return rows;
    };

    it('uploads each file to S3 under the blog prefix and records a row for it', async () => {
      const [agent] = await registerAndLogin();
      const draft = await createDraft(agent);

      const resp = await uploadImages(agent, draft.id, ['ridge.jpg', 'camp.jpg']);

      expect(resp.status).toBe(200);
      expect(resp.body).toEqual([
        { id: expect.any(String), imageUrl: expect.stringContaining('ridge.jpg') },
        { id: expect.any(String), imageUrl: expect.stringContaining('camp.jpg') },
      ]);
      expect(PutObjectCommand).toHaveBeenCalledTimes(2);
      const firstKey = PutObjectCommand.mock.calls[0][0].Key;
      expect(firstKey.startsWith('stress-less-glass-blog-images/')).toBe(true);
      expect(resp.body[0].imageUrl.endsWith(firstKey)).toBe(true);

      const rows = await imageRowsFor(draft.id);
      expect(rows.map((row) => String(row.id))).toEqual(resp.body.map((image) => image.id));
    });

    it('returns 400 when no files are sent', async () => {
      const [agent] = await registerAndLogin();
      const draft = await createDraft(agent);

      const resp = await agent.post(`/api/v1/admin/blog/${draft.id}/images`);

      expect(resp.status).toBe(400);
      expect(PutObjectCommand).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown post and uploads nothing', async () => {
      const [agent] = await registerAndLogin();

      const resp = await uploadImages(agent, '999999', ['ridge.jpg']);

      expect(resp.status).toBe(404);
      expect(PutObjectCommand).not.toHaveBeenCalled();
    });

    it('returns 403 for a customer upload and uploads nothing', async () => {
      const [adminAgent] = await registerAndLogin();
      const draft = await createDraft(adminAgent);
      const [customerAgent] = await registerAndLogin({ email: 'customer@example.com' });

      const resp = await uploadImages(customerAgent, draft.id, ['ridge.jpg']);

      expect(resp.status).toBe(403);
      expect(PutObjectCommand).not.toHaveBeenCalled();
    });

    it('rejects a PUT that references an image uploaded to a different post', async () => {
      const [agent] = await registerAndLogin();
      const draft = await createDraft(agent);
      const otherDraft = await createDraft(agent, 'Other Hike');
      const [otherImage] = (await uploadImages(agent, otherDraft.id, ['other.jpg'])).body;

      const resp = await agent.put(`/api/v1/admin/blog/${draft.id}`).send({
        title: 'Ridge Hike',
        category: 'Hiking',
        blocks: [
          { id: 'block-a', type: 'images', images: [{ imageId: otherImage.id, caption: '' }] },
        ],
      });

      expect(resp.status).toBe(400);
      expect(resp.body.message).toBe('Block 1 image 1 is not an image uploaded to this post');
      const { rows } = await pool.query('SELECT blocks FROM blog_posts WHERE id = $1', [draft.id]);
      expect(rows[0].blocks).toEqual([]);
    });

    it('deletes the row and S3 object of an image a save drops, and keeps the rest', async () => {
      const [agent] = await registerAndLogin();
      const draft = await createDraft(agent);
      const [keptImage] = (await uploadImages(agent, draft.id, ['kept.jpg', 'dropped.jpg'])).body;
      const droppedPublicId = (await imageRowsFor(draft.id))[1].public_id;

      const resp = await agent.put(`/api/v1/admin/blog/${draft.id}`).send({
        title: 'Ridge Hike',
        category: 'Hiking',
        blocks: [
          {
            id: 'block-a',
            type: 'images',
            images: [{ imageId: keptImage.id, caption: 'Kept', imageUrl: keptImage.imageUrl }],
          },
        ],
      });

      expect(resp.status).toBe(200);
      expect((await imageRowsFor(draft.id)).map((row) => String(row.id))).toEqual([keptImage.id]);
      expect(DeleteObjectCommand).toHaveBeenCalledTimes(1);
      expect(DeleteObjectCommand.mock.calls[0][0].Key).toBe(
        `stress-less-glass-blog-images/${droppedPublicId}`,
      );
      const { rows } = await pool.query('SELECT blocks FROM blog_posts WHERE id = $1', [draft.id]);
      expect(rows[0].blocks[0].images).toEqual([{ imageId: keptImage.id, caption: 'Kept' }]);
    });

    it('returns image URLs in block order on the public post', async () => {
      const [agent] = await registerAndLogin();
      const draft = await createDraft(agent);
      const [firstImage, secondImage, thirdImage] = (
        await uploadImages(agent, draft.id, ['one.jpg', 'two.jpg', 'three.jpg'])
      ).body;
      const blocks = [
        { id: 'block-a', type: 'text', body: 'Trailhead.' },
        {
          id: 'block-b',
          type: 'images',
          images: [
            { imageId: thirdImage.id, caption: 'Summit' },
            { imageId: firstImage.id, caption: '' },
          ],
        },
        { id: 'block-c', type: 'images', images: [{ imageId: secondImage.id, caption: 'Camp' }] },
      ];
      await agent
        .put(`/api/v1/admin/blog/${draft.id}`)
        .send({ title: 'Ridge Hike', category: 'Hiking', blocks });
      await agent.patch(`/api/v1/admin/blog/${draft.id}/publish`);

      const postResp = await request(app).get('/api/v1/blog/ridge-hike');

      expect(postResp.body.blocks[1].images).toEqual([
        { imageId: thirdImage.id, caption: 'Summit', imageUrl: thirdImage.imageUrl },
        { imageId: firstImage.id, caption: '', imageUrl: firstImage.imageUrl },
      ]);
      expect(postResp.body.blocks[2].images).toEqual([
        { imageId: secondImage.id, caption: 'Camp', imageUrl: secondImage.imageUrl },
      ]);
    });
  });

  describe('blog cover picture and summary', () => {
    const createDraft = async (agent) => {
      const resp = await agent
        .post('/api/v1/admin/blog')
        .send({ title: 'Ridge Hike', category: 'Hiking' });
      return resp.body;
    };

    const setCover = (agent, postId, fileName = 'cover.jpg') =>
      agent
        .put(`/api/v1/admin/blog/${postId}/cover`)
        .attach('imageFile', Buffer.from('cover bytes'), {
          filename: fileName,
          contentType: 'image/jpeg',
        });

    const coverColumns = async (postId) => {
      const { rows } = await pool.query(
        'SELECT cover_image_url, cover_public_id FROM blog_posts WHERE id = $1',
        [postId],
      );
      return rows[0];
    };

    it('stores the cover on the post and uploads it to S3 under the blog prefix', async () => {
      const [agent] = await registerAndLogin();
      const draft = await createDraft(agent);

      const resp = await setCover(agent, draft.id);

      expect(resp.status).toBe(200);
      expect(PutObjectCommand).toHaveBeenCalledTimes(1);
      const key = PutObjectCommand.mock.calls[0][0].Key;
      expect(key.startsWith('stress-less-glass-blog-images/')).toBe(true);
      expect(resp.body.coverImageUrl.endsWith(key)).toBe(true);
      const stored = await coverColumns(draft.id);
      expect(stored.cover_image_url).toBe(resp.body.coverImageUrl);
      const getResp = await agent.get(`/api/v1/admin/blog/${draft.id}`);
      expect(getResp.body.coverImageUrl).toBe(resp.body.coverImageUrl);
    });

    it('replaces the cover and deletes the previous S3 object', async () => {
      const [agent] = await registerAndLogin();
      const draft = await createDraft(agent);
      await setCover(agent, draft.id, 'first.jpg');
      const first = await coverColumns(draft.id);

      const resp = await setCover(agent, draft.id, 'second.jpg');

      expect(resp.status).toBe(200);
      const stored = await coverColumns(draft.id);
      expect(stored.cover_image_url).toContain('second.jpg');
      expect(DeleteObjectCommand).toHaveBeenCalledTimes(1);
      expect(DeleteObjectCommand.mock.calls[0][0].Key).toBe(
        `stress-less-glass-blog-images/${first.cover_public_id}`,
      );
    });

    it('returns 400 when no file is sent', async () => {
      const [agent] = await registerAndLogin();
      const draft = await createDraft(agent);

      const resp = await agent.put(`/api/v1/admin/blog/${draft.id}/cover`);

      expect(resp.status).toBe(400);
      expect(PutObjectCommand).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown post and uploads nothing', async () => {
      const [agent] = await registerAndLogin();

      const resp = await setCover(agent, '999999');

      expect(resp.status).toBe(404);
      expect(PutObjectCommand).not.toHaveBeenCalled();
    });

    it('returns 403 for a customer and leaves the cover alone', async () => {
      const [adminAgent] = await registerAndLogin();
      const draft = await createDraft(adminAgent);
      await setCover(adminAgent, draft.id);
      const [customerAgent] = await registerAndLogin({ email: 'customer@example.com' });
      jest.clearAllMocks();

      const replaceResp = await setCover(customerAgent, draft.id, 'other.jpg');
      const removeResp = await customerAgent.delete(`/api/v1/admin/blog/${draft.id}/cover`);

      expect(replaceResp.status).toBe(403);
      expect(removeResp.status).toBe(403);
      expect(PutObjectCommand).not.toHaveBeenCalled();
      expect(DeleteObjectCommand).not.toHaveBeenCalled();
      expect((await coverColumns(draft.id)).cover_image_url).toContain('cover.jpg');
    });

    it('removes the cover and deletes its S3 object', async () => {
      const [agent] = await registerAndLogin();
      const draft = await createDraft(agent);
      await setCover(agent, draft.id);
      const { cover_public_id: coverPublicId } = await coverColumns(draft.id);

      const resp = await agent.delete(`/api/v1/admin/blog/${draft.id}/cover`);

      expect(resp.status).toBe(200);
      expect(await coverColumns(draft.id)).toEqual({
        cover_image_url: null,
        cover_public_id: null,
      });
      expect(DeleteObjectCommand).toHaveBeenCalledTimes(1);
      expect(DeleteObjectCommand.mock.calls[0][0].Key).toBe(
        `stress-less-glass-blog-images/${coverPublicId}`,
      );
    });

    it('returns 404 when removing the cover of an unknown post', async () => {
      const [agent] = await registerAndLogin();

      const resp = await agent.delete('/api/v1/admin/blog/999999/cover');

      expect(resp.status).toBe(404);
      expect(DeleteObjectCommand).not.toHaveBeenCalled();
    });

    it('keeps the cover when the post is saved and saves the summary trimmed', async () => {
      const [agent] = await registerAndLogin();
      const draft = await createDraft(agent);
      await setCover(agent, draft.id);

      const putResp = await agent.put(`/api/v1/admin/blog/${draft.id}`).send({
        title: 'Ridge Hike',
        category: 'Hiking',
        summary: '  Three days to Table Lake.  ',
        blocks: [],
      });

      expect(putResp.status).toBe(200);
      const getResp = await agent.get(`/api/v1/admin/blog/${draft.id}`);
      expect(getResp.body.summary).toBe('Three days to Table Lake.');
      expect(getResp.body.coverImageUrl).toContain('cover.jpg');
      expect(DeleteObjectCommand).not.toHaveBeenCalled();
    });

    it('returns the summary and cover on the public list', async () => {
      const [agent] = await registerAndLogin();
      const draft = await createDraft(agent);
      const coverResp = await setCover(agent, draft.id);
      await agent.put(`/api/v1/admin/blog/${draft.id}`).send({
        title: 'Ridge Hike',
        category: 'Hiking',
        summary: 'Three days to Table Lake.',
        blocks: [],
      });
      await agent.patch(`/api/v1/admin/blog/${draft.id}/publish`);

      const resp = await request(app).get('/api/v1/blog');

      expect(resp.body[0]).toEqual(
        expect.objectContaining({
          summary: 'Three days to Table Lake.',
          coverImageUrl: coverResp.body.coverImageUrl,
        }),
      );
    });

    it('deletes the cover S3 object when the post is deleted', async () => {
      const [agent] = await registerAndLogin();
      const draft = await createDraft(agent);
      await setCover(agent, draft.id);
      const { cover_public_id: coverPublicId } = await coverColumns(draft.id);
      jest.clearAllMocks();

      const resp = await agent.delete(`/api/v1/admin/blog/${draft.id}`);

      expect(resp.status).toBe(200);
      expect(DeleteObjectCommand.mock.calls.map(([command]) => command.Key)).toEqual([
        `stress-less-glass-blog-images/${coverPublicId}`,
      ]);
    });
  });

  describe('DELETE /api/v1/admin/blog/:id', () => {
    const createPublishedPostWithImages = async (agent) => {
      const created = await agent
        .post('/api/v1/admin/blog')
        .send({ title: 'Ridge Hike', category: 'Hiking' });
      const uploaded = await agent
        .post(`/api/v1/admin/blog/${created.body.id}/images`)
        .attach('imageFiles', Buffer.from('a'), { filename: 'one.jpg', contentType: 'image/jpeg' })
        .attach('imageFiles', Buffer.from('b'), { filename: 'two.jpg', contentType: 'image/jpeg' });
      await agent.put(`/api/v1/admin/blog/${created.body.id}`).send({
        title: 'Ridge Hike',
        category: 'Hiking',
        blocks: [
          {
            id: 'block-a',
            type: 'images',
            images: uploaded.body.map((image) => ({ imageId: image.id, caption: '' })),
          },
        ],
      });
      await agent.patch(`/api/v1/admin/blog/${created.body.id}/publish`);
      return created.body;
    };

    it('deletes the post, its image rows and each image S3 object', async () => {
      const [agent] = await registerAndLogin();
      const post = await createPublishedPostWithImages(agent);
      const { rows: imageRows } = await pool.query(
        'SELECT public_id FROM blog_images WHERE post_id = $1 ORDER BY id',
        [post.id],
      );
      jest.clearAllMocks();

      const resp = await agent.delete(`/api/v1/admin/blog/${post.id}`);

      expect(resp.status).toBe(200);
      expect(resp.body.id).toBe(post.id);
      expect(await blogRowCount()).toBe(0);
      const { rows: remainingImages } = await pool.query(
        'SELECT id FROM blog_images WHERE post_id = $1',
        [post.id],
      );
      expect(remainingImages).toEqual([]);
      expect(DeleteObjectCommand.mock.calls.map(([command]) => command.Key).sort()).toEqual(
        imageRows.map((row) => `stress-less-glass-blog-images/${row.public_id}`).sort(),
      );
      expect((await request(app).get('/api/v1/blog/ridge-hike')).status).toBe(404);
      expect((await request(app).get('/api/v1/blog')).body).toEqual([]);
    });

    it('returns 404 for an unknown id', async () => {
      const [agent] = await registerAndLogin();

      const resp = await agent.delete('/api/v1/admin/blog/999999');

      expect(resp.status).toBe(404);
      expect(DeleteObjectCommand).not.toHaveBeenCalled();
    });

    it('returns 403 for a customer and leaves the post and its images in place', async () => {
      const [adminAgent] = await registerAndLogin();
      const post = await createPublishedPostWithImages(adminAgent);
      const [customerAgent] = await registerAndLogin({ email: 'customer@example.com' });
      jest.clearAllMocks();

      const resp = await customerAgent.delete(`/api/v1/admin/blog/${post.id}`);

      expect(resp.status).toBe(403);
      expect(await blogRowCount()).toBe(1);
      expect(DeleteObjectCommand).not.toHaveBeenCalled();
      expect((await request(app).get('/api/v1/blog/ridge-hike')).status).toBe(200);
    });
  });
});
