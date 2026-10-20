const pool = require('../utils/pool');
const { slugify, toStoredBlocks } = require('../utils/blogBlocks');

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

const getImageUrlsById = async (postIds) => {
  const { rows } = await pool.query(
    'SELECT id, image_url FROM blog_images WHERE post_id = ANY($1::bigint[])',
    [postIds],
  );
  return new Map(rows.map((row) => [String(row.id), row.image_url]));
};

const withImageUrls = (blocks, imageUrlsById) =>
  blocks.map((block) => {
    if (block.type !== 'images') return block;
    const images = block.images.map((image) => ({
      ...image,
      imageUrl: imageUrlsById.get(image.imageId) ?? null,
    }));
    return { ...block, images };
  });

const toPostWithImageUrls = async (row) => {
  const post = new BlogPost(row);
  post.blocks = withImageUrls(post.blocks, await getImageUrlsById([post.id]));
  return post;
};

class BlogPost {
  id;
  slug;
  title;
  category;
  summary;
  coverImageUrl;
  blocks;
  publishedAt;
  createdAt;
  updatedAt;

  constructor(row) {
    this.id = row.id;
    this.slug = row.slug;
    this.title = row.title;
    this.category = row.category;
    this.summary = row.summary;
    this.coverImageUrl = row.cover_image_url;
    this.blocks = row.blocks;
    this.publishedAt = row.published_at;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

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
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      category: row.category,
      publishedAt: row.published_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  static async getById(id) {
    const { rows } = await pool.query('SELECT * FROM blog_posts WHERE id = $1', [id]);
    return rows[0] ? toPostWithImageUrls(rows[0]) : null;
  }

  static async getImageIds(postId) {
    const { rows } = await pool.query('SELECT id FROM blog_images WHERE post_id = $1', [postId]);
    return new Set(rows.map((row) => String(row.id)));
  }

  static async insertImages(postId, uploads) {
    const { rows } = await pool.query(
      `
      INSERT INTO blog_images (post_id, image_url, public_id)
      SELECT $1, image_url, public_id
      FROM UNNEST($2::varchar[], $3::varchar[]) AS uploaded(image_url, public_id)
      RETURNING id, image_url
      `,
      [postId, uploads.map((upload) => upload.imageUrl), uploads.map((upload) => upload.publicId)],
    );
    return rows.map((row) => ({ id: String(row.id), imageUrl: row.image_url }));
  }

  // The cover columns are updated in place; the caller removes the previous S3 object.
  static async setCover(id, { imageUrl, publicId }) {
    const { rows } = await pool.query(
      `
      WITH previous AS (SELECT cover_public_id FROM blog_posts WHERE id = $1)
      UPDATE blog_posts
      SET cover_image_url = $2, cover_public_id = $3
      WHERE id = $1
      RETURNING (SELECT cover_public_id FROM previous) AS previous_public_id
      `,
      [id, imageUrl, publicId],
    );
    return rows[0] ? { previousPublicId: rows[0].previous_public_id } : null;
  }

  static async removeCover(id) {
    const { rows } = await pool.query(
      `
      WITH previous AS (SELECT cover_public_id FROM blog_posts WHERE id = $1)
      UPDATE blog_posts
      SET cover_image_url = NULL, cover_public_id = NULL
      WHERE id = $1
      RETURNING (SELECT cover_public_id FROM previous) AS previous_public_id
      `,
      [id],
    );
    return rows[0] ? { previousPublicId: rows[0].previous_public_id } : null;
  }

  // Images the new blocks no longer reference are deleted in the same transaction;
  // the caller removes their S3 objects after commit.
  static async update(id, { title, category, summary, blocks }) {
    const storedCategory = await matchExistingCategory(category, id);
    const storedBlocks = toStoredBlocks(blocks);
    const keptImageIds = storedBlocks
      .filter((block) => block.type === 'images')
      .flatMap((block) => block.images.map((image) => image.imageId));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `
        UPDATE blog_posts
        SET title = $2, category = $3, summary = $4, blocks = $5, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
        `,
        // pg sends a JS array as a Postgres array, not JSON, so stringify it.
        [id, title, storedCategory, summary, JSON.stringify(storedBlocks)],
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
      const { rows: removedRows } = await client.query(
        `
        DELETE FROM blog_images
        WHERE post_id = $1 AND NOT (id = ANY($2::bigint[]))
        RETURNING public_id
        `,
        [id, keptImageIds],
      );
      await client.query('COMMIT');

      return {
        post: await toPostWithImageUrls(rows[0]),
        removedPublicIds: removedRows.map((row) => row.public_id),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async deleteById(id) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: removedRows } = await client.query(
        'DELETE FROM blog_images WHERE post_id = $1 RETURNING public_id',
        [id],
      );
      const { rows } = await client.query('DELETE FROM blog_posts WHERE id = $1 RETURNING *', [id]);
      await client.query('COMMIT');

      if (!rows[0]) return null;
      const removedPublicIds = removedRows.map((row) => row.public_id);
      if (rows[0].cover_public_id) removedPublicIds.push(rows[0].cover_public_id);
      return { post: new BlogPost(rows[0]), removedPublicIds };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async publish(id) {
    const { rows } = await pool.query(
      `
      UPDATE blog_posts
      SET published_at = COALESCE(published_at, CURRENT_TIMESTAMP)
      WHERE id = $1
      RETURNING *
      `,
      [id],
    );
    return rows[0] ? new BlogPost(rows[0]) : null;
  }

  static async getPublishedList() {
    const { rows } = await pool.query(`
      SELECT id, slug, title, category, summary, cover_image_url, published_at
      FROM blog_posts
      WHERE published_at IS NOT NULL
      ORDER BY published_at DESC
    `);
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      category: row.category,
      summary: row.summary,
      coverImageUrl: row.cover_image_url,
      publishedAt: row.published_at,
    }));
  }

  static async getPublishedBySlug(slug) {
    const { rows } = await pool.query(
      'SELECT * FROM blog_posts WHERE slug = $1 AND published_at IS NOT NULL',
      [slug],
    );
    return rows[0] ? toPostWithImageUrls(rows[0]) : null;
  }
}

module.exports = BlogPost;
