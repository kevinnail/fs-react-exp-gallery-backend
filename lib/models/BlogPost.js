const pool = require('../utils/pool');
const { slugify } = require('../utils/blogBlocks');

const matchExistingCategory = async (category, excludedPostId = null) => {
  const { rows } = await pool.query(
    `
    SELECT category FROM blog_posts
    WHERE LOWER(category) = LOWER($1) AND id IS DISTINCT FROM $2
    LIMIT 1
    `,
    [category, excludedPostId],
  );
  return rows[0]?.category ?? category;
};

module.exports = class BlogPost {
  id;
  slug;
  title;
  category;
  blocks;
  publishedAt;
  createdAt;
  updatedAt;

  constructor(row) {
    this.id = row.id;
    this.slug = row.slug;
    this.title = row.title;
    this.category = row.category;
    this.blocks = row.blocks;
    this.publishedAt = row.published_at;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

.
  static async insert({ title, category }) {
    const baseSlug = slugify(title);
    const { rows: takenRows } = await pool.query(
      `
      SELECT slug FROM blog_posts
      WHERE slug = $1 OR slug ~ ('^' || $1 || '-[0-9]+$')
      `,
      [baseSlug],
    );
    const takenSlugs = new Set(takenRows.map((row) => row.slug));

    let slug = baseSlug;
    let suffix = 2;
    while (takenSlugs.has(slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const storedCategory = await matchExistingCategory(category);

    const { rows } = await pool.query(
      `
      INSERT INTO blog_posts (slug, title, category)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [slug, title, storedCategory],
    );
    return new BlogPost(rows[0]);
  }

  // Drafts (null published_at) first, then newest published.
  static async getAllForAdmin() {
    const { rows } = await pool.query(`
      SELECT id, slug, title, category, published_at, created_at, updated_at
      FROM blog_posts
      ORDER BY published_at DESC NULLS FIRST, created_at DESC
    `);
    return rows.map((row) => new BlogPost(row));
  }

  static async getById(id) {
    const { rows } = await pool.query('SELECT * FROM blog_posts WHERE id = $1', [id]);
    return rows[0] ? new BlogPost(rows[0]) : null;
  }

  static async update(id, { title, category, blocks }) {
    const storedCategory = await matchExistingCategory(category, id);
    const { rows } = await pool.query(
      `
      UPDATE blog_posts
      SET title = $2, category = $3, blocks = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [id, title, storedCategory, JSON.stringify(blocks)],
    );
    return rows[0] ? new BlogPost(rows[0]) : null;
  }
};
