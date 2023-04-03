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
  }

  static async getGalleryPosts() {
    const { rows } = await pool.query(
      'SELECT * FROM gallery_posts ORDER BY created_at DESC'
    );
    return rows.map((row) => new Gallery(row));
  }

  //   static async getGalleryPostById(id) {
  //     const { rows } = await pool.query(
  //       'SELECT * FROM gallery_posts WHERE id=$1',
  //       [id]
  //     );
  //     return new gallery(rows[0]);
  //   }

  //   static async getGalleryImagesByPostId(post_id) {
  //     const { rows } = await pool.query(
  //       'SELECT * FROM gallery_images WHERE post_id=$1',
  //       [post_id]
  //     );
  //     return rows.map((row) => new gallery(row));
  //   }
};
