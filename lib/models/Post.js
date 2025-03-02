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
  originalPrice;
  discountedPrice;
  sold;
  selling_link;
  hide;

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
    num_imgs,
    sold,
    link
  ) {
    const { rows } = await pool.query(
      `INSERT INTO gallery_posts (title, description, 
      image_url, category, price, author_id, public_id, 
      num_imgs, sold, selling_link) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        title,
        description,
        image_url,
        category,
        price,
        author_id,
        public_id,
        num_imgs,
        sold,
        link,
      ]
    );

    const data = new Post(rows[0]);

    return data;
  }

  // add additional image urls/ public_id's beyond the first one
  static async addGalleryImages(post_id, image_urls, image_public_ids) {
    const insertQuery = `
      INSERT INTO gallery_imgs (post_id, image_url, public_id)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;

    const addedImages = [];
    for (let i = 0; i < image_urls.length; i++) {
      const { rows } = await pool.query(insertQuery, [
        post_id,
        image_urls[i],
        image_public_ids[i],
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
    num_imgs,
    discounted_price,
    original_price,
    sold,
    link,
    hide
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
          num_imgs = $9,
         discounted_price = $10,
         original_price = $11,
         sold = $12,
         selling_link=$13,
         hide=$14
        
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
        discounted_price,
        original_price,
        sold,
        link,
        hide,
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

  async saveBulkEditPost() {
    const { rows } = await pool.query(
      `UPDATE gallery_posts
     SET discounted_price = $1, original_price = $2
     WHERE id = $3
     RETURNING *`,
      [this.discountedPrice, this.originalPrice, this.id]
    );
    return new Post(rows[0]);
  }
};
