const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');

// `setup.sql` seeds three "Test N" posts. Fixtures use a term that
// appears nowhere in that seed data, so a search can only match what
// this file inserted.
const insertPost = ({
  title,
  category = 'misc',
  description = 'a piece',
  price = '100',
  hide = false,
  isDeleted = false,
}) =>
  pool.query(
    `INSERT INTO gallery_posts (title, category, description, price, hide, is_deleted)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [title, category, description, price, hide, isDeleted],
  );

const searchFor = (term) => request(app).get(`/api/v1/main-gallery/search/${term}`);

const titlesIn = (body) => body.map((post) => post.title);

describe('GET /api/v1/main-gallery/search/:term', () => {
  beforeEach(async () => {
    await setup(pool);

    await insertPost({ title: 'Zephyr Marble', category: 'marbles', price: '120' });
    await insertPost({ title: 'Blue Spoon', category: 'zephyr-series' });
    await insertPost({ title: 'Green Pipe', description: 'worked in zephyr glass' });
    await insertPost({ title: 'Zephyr Pendant', hide: true });
    await insertPost({ title: 'Zephyr Rig', isDeleted: true });
  });

  afterAll(() => {
    return pool.end();
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
