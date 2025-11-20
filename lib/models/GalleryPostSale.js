const pool = require('../utils/pool');

module.exports = class GalleryPostSale {
  id;
  post_id;
  buyer_id;
  price;
  tracking_number;
  created_at;
  is_paid;
  paid_at;

  constructor(row) {
    this.id = row.id;
    this.post_id = row.post_id;
    this.buyer_id = row.buyer_id;
    this.price = row.price;
    this.tracking_number = row.tracking_number;
    this.created_at = row.created_at;
    this.is_paid = row.is_paid;
    this.paid_at = row.paid_at;
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

  u.email AS buyer_email,
  p.first_name AS buyer_first_name,
  p.last_name AS buyer_last_name,
  (p.first_name || ' ' || p.last_name) AS buyer_name

FROM gallery_post_sales gps
JOIN gallery_posts gp ON gps.post_id = gp.id
JOIN users_admin u ON gps.buyer_id = u.id
JOIN profiles p ON p.user_id = u.id

ORDER BY gps.created_at DESC;


      `,
    );

    return rows;
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

  static async updatePaidStatus(id, isPaid) {
    const { rows } = await pool.query(
      `
      UPDATE gallery_post_sales
      SET is_paid = $2,
      paid_at = CASE 
      WHEN $2 = true THEN NOW()
      ELSE NULL
      END
      WHERE id = $1
      RETURNING *;
    `,
      [id, isPaid],
    );

    return new GalleryPostSale(rows[0]);
  }
};
