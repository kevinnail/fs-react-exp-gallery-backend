const pool = require('../utils/pool');

module.exports = class Post {
  id;
  created_at;
  title;
  description;
  image_url;
  category;
  price;
  author_id;

  constructor(row) {
    this.id = row.id;
    this.created_at = row.created_at;
    this.title = row.title;
    this.description = row.description;
    this.image_url = row.image_url;
    this.category = row.category;
    this.price = row.price;
    this.author_id = row.author_id;
  }

  static async postNewPost(
    title,
    description,
    image_url,
    category,
    price,
    author_id
  ) {
    const { rows } = await pool.query(
      'INSERT INTO gallery_posts (title, description, image_url, category, price, author_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [title, description, image_url, category, price, author_id]
    );
    return new Post(rows[0]);
  }

  static async updateById(
    id,
    title,
    description,
    image_url,
    category,
    price,
    author_id
  ) {
    const { rows } = await pool.query(
      `
      UPDATE gallery_posts
      SET title = $2,
      description = $3,
      image_url = $4,
      category = $5,
      price = $6,
      author_id = $7      
      WHERE id = $1
      RETURNING *
      `,
      [id, title, description, image_url, category, price, author_id]
    );
    return new Post(rows[0]);
  }

  static async getById(post_id) {
    const { rows } = await pool.query(
      `
      SELECT * 
      FROM gallery_posts 
      WHERE id=$1 
      `,
      [post_id]
    );
    if (!rows[0]) {
      return null;
    }

    return new Post(rows[0]);
  }
};
