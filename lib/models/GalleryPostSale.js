const pool = require('../utils/pool');

module.exports = class GalleryPostSale {
  id;
  post_id;
  buyer_id;
  price;
  tracking_number;
  created_at;

  constructor(row) {
    this.id = row.id;
    this.post_id = row.post_id;
    this.buyer_id = row.buyer_id;
    this.price = row.price;
    this.tracking_number = row.tracking_number;
    this.created_at = row.created_at;
  }

  static async createSale({ postId, buyerId, price, tracking }) {
    const { rows } = await pool.query(
      `
        INSERT INTO gallery_post_sales 
        (post_id, buyer_id, price, tracking_number)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `,
      [postId, buyerId, price, tracking],
    );

    return new GalleryPostSale(rows[0]);
  }

  static async getAllSales() {
    const { rows } = await pool.query(
      `
        SELECT 
          gps.*, 
          gp.title AS post_title,
          gp.image_url AS image_url,
          u.email AS buyer_email
        FROM gallery_post_sales gps
        JOIN gallery_posts gp ON gps.post_id = gp.id
        JOIN users_admin u ON gps.buyer_id = u.id
        ORDER BY gps.created_at DESC;
      `,
    );

    return rows.map((row) => new GalleryPostSale(row));
  }

  static async getSaleById(id) {
    const { rows } = await pool.query(
      `
        SELECT * 
        FROM gallery_post_sales
        WHERE id=$1;
      `,
      [id],
    );

    if (!rows[0]) return null;
    return new GalleryPostSale(rows[0]);
  }

  static async updateTracking(id, tracking) {
    const { rows } = await pool.query(
      `
        UPDATE gallery_post_sales
        SET tracking_number=$2
        WHERE id=$1
        RETURNING *;
      `,
      [id, tracking],
    );

    return new GalleryPostSale(rows[0]);
  }
};
