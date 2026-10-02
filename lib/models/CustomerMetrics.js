const pool = require('../utils/pool');

const CUSTOMER_ROLLUP_QUERY = `
  WITH gallery_order_totals AS (
    SELECT
      o.id,
      o.buyer_id,
      o.is_paid,
      o.created_at,
      o.shipping_cost + COALESCE(SUM(item.price), 0) AS order_total,
      COUNT(item.id) AS item_count
    FROM sales_orders o
    LEFT JOIN gallery_post_sales item ON item.order_id = o.id
    GROUP BY o.id
  ),
  gallery AS (
    SELECT
      buyer_id AS user_id,
      COUNT(*) AS order_count,
      SUM(item_count) AS item_count,
      SUM(order_total) AS gross,
      SUM(order_total) FILTER (WHERE is_paid) AS collected,
      SUM(order_total) FILTER (WHERE NOT is_paid) AS outstanding,
      SUM(order_total) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS gross_last_30_days,
      SUM(order_total) FILTER (
        WHERE created_at >= NOW() - INTERVAL '60 days'
          AND created_at < NOW() - INTERVAL '30 days'
      ) AS gross_prior_30_days,
      MAX(order_total) AS largest_order,
      MIN(created_at) AS first_purchase_at,
      MAX(created_at) AS last_purchase_at
    FROM gallery_order_totals
    GROUP BY buyer_id
  ),
  auction AS (
    SELECT
      winner_id AS user_id,
      COUNT(*) AS win_count,
      SUM(final_bid) AS gross,
      SUM(final_bid) FILTER (WHERE is_paid) AS collected,
      SUM(final_bid) FILTER (WHERE is_paid IS NOT TRUE) AS outstanding,
      SUM(final_bid) FILTER (WHERE closed_at >= NOW() - INTERVAL '30 days') AS gross_last_30_days,
      SUM(final_bid) FILTER (
        WHERE closed_at >= NOW() - INTERVAL '60 days'
          AND closed_at < NOW() - INTERVAL '30 days'
      ) AS gross_prior_30_days,
      MAX(final_bid) AS largest_order,
      MIN(closed_at) AS first_purchase_at,
      MAX(closed_at) AS last_purchase_at
    FROM auction_results
    WHERE winner_id IS NOT NULL
    GROUP BY winner_id
  ),
  bidding AS (
    SELECT
      user_id,
      COUNT(*) AS bid_count,
      COUNT(DISTINCT auction_id) AS auctions_bid_on,
      MAX(created_at) AS last_bid_at
    FROM bids
    GROUP BY user_id
  ),
  messaging AS (
    SELECT
      user_id,
      COUNT(*) AS message_count,
      MAX(sent_at) AS last_message_at
    FROM messages
    WHERE is_from_admin = false
    GROUP BY user_id
  )
  SELECT
    u.id,
    u.email,
    u.is_verified,
    p.first_name,
    p.last_name,
    p.image_url,
    p.created_at AS joined_at,
    COALESCE(p.email_promotions, false) AS email_promotions,
    EXISTS (SELECT 1 FROM addresses address WHERE address.user_id = u.id) AS has_address,
    (COALESCE(gallery.order_count, 0) + COALESCE(auction.win_count, 0))::int AS order_count,
    (COALESCE(gallery.item_count, 0) + COALESCE(auction.win_count, 0))::int AS item_count,
    COALESCE(auction.win_count, 0)::int AS auctions_won,
    COALESCE(gallery.gross, 0) + COALESCE(auction.gross, 0) AS gross,
    COALESCE(gallery.collected, 0) + COALESCE(auction.collected, 0) AS collected,
    COALESCE(gallery.outstanding, 0) + COALESCE(auction.outstanding, 0) AS outstanding,
    COALESCE(gallery.gross_last_30_days, 0) + COALESCE(auction.gross_last_30_days, 0)
      AS gross_last_30_days,
    COALESCE(gallery.gross_prior_30_days, 0) + COALESCE(auction.gross_prior_30_days, 0)
      AS gross_prior_30_days,
    COALESCE(GREATEST(gallery.largest_order, auction.largest_order), 0) AS largest_order,
    LEAST(gallery.first_purchase_at, auction.first_purchase_at) AS first_purchase_at,
    GREATEST(gallery.last_purchase_at, auction.last_purchase_at) AS last_purchase_at,
    COALESCE(bidding.bid_count, 0)::int AS bid_count,
    COALESCE(bidding.auctions_bid_on, 0)::int AS auctions_bid_on,
    bidding.last_bid_at,
    COALESCE(messaging.message_count, 0)::int AS message_count,
    messaging.last_message_at
  FROM users_admin u
  LEFT JOIN profiles p ON p.user_id = u.id
  LEFT JOIN gallery ON gallery.user_id = u.id
  LEFT JOIN auction ON auction.user_id = u.id
  LEFT JOIN bidding ON bidding.user_id = u.id
  LEFT JOIN messaging ON messaging.user_id = u.id
  ORDER BY p.created_at DESC NULLS LAST, u.id DESC;
`;

// pg returns NUMERIC as a string to avoid float loss. These are currency
// totals at a scale where a JavaScript number is exact to the cent.
const toCustomer = (row) => ({
  id: row.id,
  email: row.email,
  isVerified: row.is_verified,
  firstName: row.first_name,
  lastName: row.last_name,
  imageUrl: row.image_url,
  joinedAt: row.joined_at,
  emailPromotions: row.email_promotions,
  hasAddress: row.has_address,
  orderCount: row.order_count,
  itemCount: row.item_count,
  auctionsWon: row.auctions_won,
  gross: Number(row.gross),
  collected: Number(row.collected),
  outstanding: Number(row.outstanding),
  grossLast30Days: Number(row.gross_last_30_days),
  grossPrior30Days: Number(row.gross_prior_30_days),
  largestOrder: Number(row.largest_order),
  firstPurchaseAt: row.first_purchase_at,
  lastPurchaseAt: row.last_purchase_at,
  bidCount: row.bid_count,
  auctionsBidOn: row.auctions_bid_on,
  lastBidAt: row.last_bid_at,
  messageCount: row.message_count,
  lastMessageAt: row.last_message_at,
});

module.exports = class CustomerMetrics {
  static async getCustomerRollup() {
    const { rows } = await pool.query(CUSTOMER_ROLLUP_QUERY);
    return rows.map(toCustomer);
  }
};
