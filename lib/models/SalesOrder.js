const pool = require('../utils/pool');
const Post = require('./Post');

const ORDER_COLUMNS = `
  o.id,
  o.buyer_id,
  o.shipping_cost,
  o.tracking_number,
  o.is_paid,
  o.paid_at,
  o.created_at,
  o.updated_at
`;

const ITEM_COLUMNS = `
  item.id,
  item.order_id,
  item.post_id,
  item.price,
  item.created_at,
  post.title AS post_title,
  post.image_url AS post_image_url,
  post.price AS post_price
`;

const attachItems = (orders, itemRows) => {
  const itemsByOrderId = new Map();

  for (const itemRow of itemRows) {
    const existing = itemsByOrderId.get(itemRow.order_id);
    if (existing) {
      existing.push(itemRow);
    } else {
      itemsByOrderId.set(itemRow.order_id, [itemRow]);
    }
  }

  return orders.map((order) => ({
    ...order,
    items: itemsByOrderId.get(order.id) || [],
  }));
};

module.exports = class SalesOrder {
  // Creates the order, its items, and flips every referenced post to sold in one
  // transaction. Insert-then-update as separate statements can half-apply: an order
  // with items but pieces still listed for sale.
  static async createOrder({ buyerId, items, shippingCost, tracking }) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows: orderRows } = await client.query(
        `
          INSERT INTO sales_orders (buyer_id, shipping_cost, tracking_number)
          VALUES ($1, $2, $3)
          RETURNING *;
        `,
        [buyerId, shippingCost, tracking],
      );
      const order = orderRows[0];

      const postIds = items.map((item) => item.postId);
      const prices = items.map((item) => item.price);

      const { rows: itemRows } = await client.query(
        `
          INSERT INTO gallery_post_sales (order_id, post_id, price)
          SELECT $1, post_id, price
          FROM UNNEST($2::int[], $3::numeric[]) AS incoming(post_id, price)
          RETURNING *;
        `,
        [order.id, postIds, prices],
      );

      await Post.markSoldByIds(postIds, client);

      await client.query('COMMIT');

      return { ...order, items: itemRows };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getAllOrders() {
    const { rows: orderRows } = await pool.query(
      `
        SELECT
          ${ORDER_COLUMNS},
          buyer.email AS buyer_email,
          profile.first_name AS buyer_first_name,
          profile.last_name AS buyer_last_name,
          (profile.first_name || ' ' || profile.last_name) AS buyer_name
        FROM sales_orders o
        JOIN users_admin buyer ON o.buyer_id = buyer.id
        LEFT JOIN profiles profile ON profile.user_id = buyer.id
        ORDER BY o.created_at DESC;
      `,
    );

    if (orderRows.length === 0) return [];

    const { rows: itemRows } = await pool.query(
      `
        SELECT ${ITEM_COLUMNS}
        FROM gallery_post_sales item
        JOIN gallery_posts post ON post.id = item.post_id
        WHERE item.order_id = ANY($1)
        ORDER BY item.id ASC;
      `,
      [orderRows.map((order) => order.id)],
    );

    return attachItems(orderRows, itemRows);
  }

  static async getAllOrdersByUserId(buyerId) {
    const { rows: orderRows } = await pool.query(
      `
        SELECT ${ORDER_COLUMNS}
        FROM sales_orders o
        WHERE o.buyer_id = $1
        ORDER BY o.created_at DESC;
      `,
      [buyerId],
    );

    if (orderRows.length === 0) return [];

    const { rows: itemRows } = await pool.query(
      `
        SELECT ${ITEM_COLUMNS}
        FROM gallery_post_sales item
        JOIN gallery_posts post ON post.id = item.post_id
        WHERE item.order_id = ANY($1)
        ORDER BY item.id ASC;
      `,
      [orderRows.map((order) => order.id)],
    );

    return attachItems(orderRows, itemRows);
  }

  static async getOrderById(orderId) {
    const { rows: orderRows } = await pool.query(
      `
        SELECT ${ORDER_COLUMNS}
        FROM sales_orders o
        WHERE o.id = $1;
      `,
      [orderId],
    );

    if (!orderRows[0]) return null;

    const { rows: itemRows } = await pool.query(
      `
        SELECT ${ITEM_COLUMNS}
        FROM gallery_post_sales item
        JOIN gallery_posts post ON post.id = item.post_id
        WHERE item.order_id = $1
        ORDER BY item.id ASC;
      `,
      [orderId],
    );

    return { ...orderRows[0], items: itemRows };
  }

  static async updateTracking(orderId, tracking) {
    const { rows } = await pool.query(
      `
        UPDATE sales_orders
        SET tracking_number = $2,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *;
      `,
      [orderId, tracking],
    );

    return rows[0] || null;
  }

  static async updatePaidStatus(orderId, isPaid) {
    const { rows } = await pool.query(
      `
        UPDATE sales_orders
        SET is_paid = $2,
            paid_at = CASE WHEN $2 = true THEN NOW() ELSE NULL END,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *;
      `,
      [orderId, isPaid],
    );

    return rows[0] || null;
  }
};
