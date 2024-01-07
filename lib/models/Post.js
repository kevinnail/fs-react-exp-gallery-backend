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
  public_id;
  num_imgs;
  resource_type;

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
    this.resource_type = row.resource_type;
  }

  // post a new post
  static async postNewPost(
    title,
    description,
    image_url,
    category,
    price,
    author_id,
    public_id,
    num_imgs
  ) {
    const { rows } = await pool.query(
      'INSERT INTO gallery_posts (title, description, image_url, category, price, author_id, public_id, num_imgs) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [
        title,
        description,
        image_url,
        category,
        price,
        author_id,
        public_id,
        num_imgs,
      ]
    );

    const data = new Post(rows[0]);

    return data;
  }

  // add additional image urls/ public_id's beyond the first one
  static async addGalleryImages(
    post_id,
    image_urls,
    image_public_ids,
    resource_types
  ) {
    const insertQuery = `
      INSERT INTO gallery_imgs (post_id, image_url, public_id, resource_type)
      VALUES ($1, $2, $3,$4)
      RETURNING *;
    `;

    const addedImages = [];
    for (let i = 0; i < image_urls.length; i++) {
      const { rows } = await pool.query(insertQuery, [
        post_id,
        image_urls[i],
        image_public_ids[i],
        resource_types[i],
      ]);
      addedImages.push(new Post(rows[0]));
    }
    return addedImages;
  }

  // update a post
  static async updateById(
    id,
    title,
    description,
    image_url,
    category,
    price,
    author_id,
    public_id,
    num_imgs
  ) {
    const { rows } = await pool.query(
      `
      UPDATE gallery_posts
      SET title = $2,
          description = $3,
          image_url = $4,
          category = $5,
          price = $6,
          author_id = $7,
          public_id = $8,
          num_imgs = $9
      WHERE id = $1
      RETURNING *;
      `,
      [
        id,
        title,
        description,
        image_url,
        category,
        price,
        author_id,
        public_id,
        num_imgs,
      ]
    );
    return new Post(rows[0]);
  }

  //get a post by id
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
  static async deleteById(post) {
    const { rows } = await pool.query(
      `
    DELETE from gallery_posts
    WHERE id = $1
    RETURNING *
    `,
      [post]
    );
    return new Post(rows[0]);
  }

  static async deleteImgDataById(post_id, public_id) {
    const { rows } = await pool.query(
      `
    DELETE from gallery_imgs
    WHERE post_id = $1 AND public_id = $2
    RETURNING *
    `,
      [post_id, public_id]
    );
    return new Post(rows[0]);
  }

  static async getAdditionalImages(post_id) {
    const { rows } = await pool.query(
      `
      SELECT * 
      FROM gallery_imgs 
      WHERE post_id=$1 
      `,
      [post_id]
    );
    if (!rows[0]) {
      return [];
    }

    return rows;
  }
};
