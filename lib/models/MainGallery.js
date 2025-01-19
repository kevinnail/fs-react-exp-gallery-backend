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
  }

  static async getGalleryPosts() {
    const { rows } = await pool.query(
      'SELECT * FROM gallery_posts ORDER BY created_at DESC'
    );
    return rows.map((row) => new Gallery(row));
  }

  static async searchGalleryPosts(searchTerm) {
    const { rows } = await pool.query(
      `
      SELECT * 
      FROM gallery_posts 
      WHERE title ILIKE $1 OR title ILIKE $2 OR title ILIKE $3 OR title ILIKE $4
         OR category ILIKE $1 OR category ILIKE $2 OR category ILIKE $3 OR category ILIKE $4
         OR description ILIKE $1 OR description ILIKE $2 OR description ILIKE $3 OR description ILIKE $4
      ORDER BY created_at DESC
    `,
      [
        `%${searchTerm}%`,
        `%${searchTerm} %`,
        `% ${searchTerm}%`,
        `%${searchTerm}.%`,
      ]
    );

    return rows.map((row) => new Gallery(row));
  }

  static async getGalleryPostById(id) {
    const { rows } = await pool.query(
      'SELECT * FROM gallery_posts WHERE id=$1',
      [id]
    );

    if (!rows[0]) {
      return null;
    }
    return new Gallery(rows[0]);
  }

  static async getGalleryImagesByPostId(post_id) {
    const { rows } = await pool.query(
      'SELECT * FROM  gallery_imgs WHERE post_id=$1',
      [post_id]
    );
    return rows.map((row) => new Gallery(row));
  }
};
