const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');

// `setup.sql` seeds three "Test N" posts. Fixtures use a term that
// appears nowhere in that seed data, so a search can only match what
// this file inserted.
const insertPost = async ({
  title,
  category = 'misc',
  description = 'a piece',
  price = '100',
  hide = false,
  isDeleted = false,
  imageUrl = null,
}) => {
  const { rows } = await pool.query(
    `INSERT INTO gallery_posts (title, category, description, price, hide, is_deleted, image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [title, category, description, price, hide, isDeleted, imageUrl],
  );

  return rows[0].id;
};

const insertGalleryImage = (postId, imageUrl) =>
  pool.query('INSERT INTO gallery_imgs (post_id, image_url, public_id) VALUES ($1, $2, $3)', [
    postId,
    imageUrl,
    `public-${imageUrl}`,
  ]);

const searchFor = (term) => request(app).get(`/api/v1/main-gallery/search/${term}`);

const fetchGallery = () => request(app).get('/api/v1/main-gallery');

const titlesIn = (body) => body.map((post) => post.title);

const postTitled = (body, title) => body.find((post) => post.title === title);

afterAll(() => {
  return pool.end();
});

describe('GET /api/v1/main-gallery/search/:term', () => {
  beforeEach(async () => {
    await setup(pool);

    await insertPost({ title: 'Zephyr Marble', category: 'marbles', price: '120' });
    await insertPost({ title: 'Blue Spoon', category: 'zephyr-series' });
    await insertPost({ title: 'Green Pipe', description: 'worked in zephyr glass' });
    await insertPost({ title: 'Zephyr Pendant', hide: true });
    await insertPost({ title: 'Zephyr Rig', isDeleted: true });
  });

  it('matches on title, category, and description', async () => {
    const { status, body } = await searchFor('zephyr');

    expect(status).toBe(200);
    expect(titlesIn(body).sort()).toEqual(['Blue Spoon', 'Green Pipe', 'Zephyr Marble']);
  });

  it('returns the full post record for a match', async () => {
    const { body } = await searchFor('zephyr');
    const marble = body.find((post) => post.title === 'Zephyr Marble');

    expect(marble).toEqual(
      expect.objectContaining({
        id: expect.anything(),
        title: 'Zephyr Marble',
        category: 'marbles',
        description: 'a piece',
        price: '120',
        sold: false,
        hide: false,
      }),
    );
  });

  it('matches case-insensitively and on partial words', async () => {
    const { body } = await searchFor('ZEPH');

    expect(titlesIn(body).sort()).toEqual(['Blue Spoon', 'Green Pipe', 'Zephyr Marble']);
  });

  it('excludes hidden posts whose title matches', async () => {
    const { body } = await searchFor('zephyr');

    expect(titlesIn(body)).not.toContain('Zephyr Pendant');
  });

  it('excludes soft-deleted posts whose title matches', async () => {
    const { body } = await searchFor('zephyr');

    expect(titlesIn(body)).not.toContain('Zephyr Rig');
  });

  it('returns an empty list when nothing matches', async () => {
    const { status, body } = await searchFor('nothingmatchesthis');

    expect(status).toBe(200);
    expect(body).toEqual([]);
  });
});

// The list query carries each post's first additional image as
// `fallbackImageUrl` via a lateral join, so the grid card doesn't have to
// fetch it per post. These cover the ways that join can go wrong.
describe('GET /api/v1/main-gallery', () => {
  beforeEach(() => {
    return setup(pool);
  });

  it('returns one row per post when a post has several additional images', async () => {
    // `setup.sql` seeds three posts and attaches three images to post 1.
    // A plain join against gallery_imgs would return five rows here.
    const { status, body } = await fetchGallery();

    expect(status).toBe(200);
    expect(titlesIn(body).sort()).toEqual(['Test 1', 'Test 2', 'Test 3']);
  });

  it('supplies the first additional image as the fallback when a post has no image of its own', async () => {
    const postId = await insertPost({ title: 'No Cover', imageUrl: null });
    await insertGalleryImage(postId, 'first.jpg');
    await insertGalleryImage(postId, 'second.jpg');

    const { body } = await fetchGallery();
    const post = postTitled(body, 'No Cover');

    expect(post.image_url).toBeNull();
    expect(post.fallbackImageUrl).toBe('first.jpg');
  });

  it('still returns a post that has no additional images, with a null fallback', async () => {
    await insertPost({ title: 'Bare Post', imageUrl: null });

    const { body } = await fetchGallery();
    const post = postTitled(body, 'Bare Post');

    expect(post).toBeDefined();
    expect(post.fallbackImageUrl).toBeNull();
  });

  it("leaves a post's own image_url untouched when it also has additional images", async () => {
    const postId = await insertPost({ title: 'Has Cover', imageUrl: 'cover.jpg' });
    await insertGalleryImage(postId, 'extra.jpg');

    const { body } = await fetchGallery();
    const post = postTitled(body, 'Has Cover');

    expect(post.image_url).toBe('cover.jpg');
    expect(post.fallbackImageUrl).toBe('extra.jpg');
  });

  it('excludes hidden and soft-deleted posts even when they have images attached', async () => {
    const hiddenId = await insertPost({ title: 'Hidden Piece', hide: true });
    await insertGalleryImage(hiddenId, 'hidden.jpg');

    const deletedId = await insertPost({ title: 'Deleted Piece', isDeleted: true });
    await insertGalleryImage(deletedId, 'deleted.jpg');

    const { body } = await fetchGallery();

    expect(titlesIn(body)).not.toContain('Hidden Piece');
    expect(titlesIn(body)).not.toContain('Deleted Piece');
  });
});
