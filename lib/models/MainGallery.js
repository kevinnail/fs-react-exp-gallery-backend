const pool = require('../utils/pool');

module.exports = class Gallery {
  id;
  created_at;
  title;
  description;
  image_url;
  category;
  price;
  author_id;
  public_id;
  num_imgs;
  originalPrice;
  discountedPrice;
  sold;
  selling_link;
  hide;
  fallbackImageUrl;

  constructor(row) {
    this.id = row.id;
    this.created_at = row.created_at;
    this.title = row.title;
    this.description = row.description;
    this.image_url = row.image_url;
    this.category = row.category;
    this.price = row.price;
    this.author_id = row.author_id;
    this.public_id = row.public_id;
    this.num_imgs = row.num_imgs;
    this.originalPrice = row.original_price;
    this.discountedPrice = row.discounted_price;
    this.sold = row.sold;
    this.selling_link = row.selling_link;
    this.hide = row.hide;
    this.fallbackImageUrl = row.fallback_image_url;
  }

  // The grid card falls back to a post's first additional image when the
  // post itself has no `image_url`. The lateral join carries that one
  // string in the list payload so the card never has to fetch per post.
  static async getGalleryPosts() {
    const { rows } = await pool.query(`
      SELECT gallery_posts.*, fallback_image.image_url AS fallback_image_url
      FROM gallery_posts
      LEFT JOIN LATERAL (
        SELECT image_url
        FROM gallery_imgs
        WHERE gallery_imgs.post_id = gallery_posts.id
        ORDER BY gallery_imgs.id
        LIMIT 1
      ) AS fallback_image ON TRUE
      WHERE hide = FALSE AND is_deleted = FALSE
      ORDER BY created_at DESC
    `);
    return rows.map((row) => new Gallery(row));
  }

  static async searchGalleryPosts(searchTerm) {
    const { rows } = await pool.query(
      `
      SELECT * 
      FROM gallery_posts 
      WHERE hide = FALSE AND is_deleted = FALSE AND (
        title ILIKE $1 OR category ILIKE $1 OR description ILIKE $1
      )
      ORDER BY created_at DESC
    `,
      [`%${searchTerm}%`],
    );

    return rows.map((row) => new Gallery(row));
  }

  static async getGalleryPostById(id) {
    const { rows } = await pool.query('SELECT * FROM gallery_posts WHERE id=$1', [id]);

    if (!rows[0]) {
      return null;
    }
    return new Gallery(rows[0]);
  }

  static async getGalleryImagesByPostId(post_id) {
    const { rows } = await pool.query('SELECT * FROM  gallery_imgs WHERE post_id=$1', [post_id]);
    return rows.map((row) => new Gallery(row));
  }
};
