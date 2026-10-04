const pool = require('../utils/pool');

module.exports = class ChartSeries {
  bucket;
  galleryRevenue;
  auctionRevenue;
  orderCount;
  itemsSold;
  signups;
  firstTimeBuyers;
  returningBuyerOrders;
  conversionRate;

  constructor(row) {
    this.bucket = row.bucket;
    this.galleryRevenue = Number(row.gallery_revenue);
    this.auctionRevenue = Number(row.auction_revenue);
    this.orderCount = row.order_count;
    this.itemsSold = row.items_sold;
    this.signups = row.signups;
    this.firstTimeBuyers = row.first_time_buyers;
    this.returningBuyerOrders = row.returning_buyer_orders;
    this.conversionRate = Number(row.conversion_rate);
  }

  // One row per day, week or month in Pacific time, oldest first. Timestamp
  // columns are naive UTC, so they are converted before truncating; otherwise a
  // 6pm sale on the 31st lands in the next month. Periods with no sales are 0.
  // Conversion is buyers over signups as of the end of each period, counting
  // all history before the range, and 0 before the first signup.
  static async getByPeriod(granularity, range) {
    const { rows } = await pool.query(
      `
      WITH bounds AS (
        SELECT
          date_trunc($1::text, COALESCE(
            (NOW() AT TIME ZONE 'America/Los_Angeles') - CASE $2::text
              WHEN '3m' THEN INTERVAL '3 months'
              WHEN '6m' THEN INTERVAL '6 months'
              WHEN '12m' THEN INTERVAL '12 months'
            END,
            LEAST(
              (SELECT MIN(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')
                FROM sales_orders),
              (SELECT MIN(closed_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')
                FROM auction_results WHERE winner_id IS NOT NULL),
              (SELECT MIN(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')
                FROM profiles)
            ),
            NOW() AT TIME ZONE 'America/Los_Angeles'
          )) AS first_bucket,
          date_trunc($1::text, NOW() AT TIME ZONE 'America/Los_Angeles') AS last_bucket
      ),
      buckets AS (
        SELECT generate_series(first_bucket, last_bucket, ('1 ' || $1::text)::interval) AS bucket_start
        FROM bounds
      ),
      gallery_orders AS (
        SELECT
          date_trunc($1::text, o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')
            AS bucket_start,
          o.shipping_cost + COALESCE(SUM(item.price), 0) AS order_total,
          COUNT(item.id) AS item_count
        FROM sales_orders o
        LEFT JOIN gallery_post_sales item ON item.order_id = o.id
        GROUP BY o.id
      ),
      gallery AS (
        SELECT bucket_start, SUM(order_total) AS revenue, SUM(item_count) AS items
        FROM gallery_orders
        GROUP BY bucket_start
      ),
      auction AS (
        SELECT
          date_trunc($1::text, closed_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')
            AS bucket_start,
          SUM(final_bid) AS revenue,
          COUNT(*) AS wins
        FROM auction_results
        WHERE winner_id IS NOT NULL
        GROUP BY 1
      ),
      purchases AS (
        SELECT
          buyer_id AS user_id,
          created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles' AS purchased_at
        FROM sales_orders
        UNION ALL
        SELECT
          winner_id,
          closed_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles'
        FROM auction_results
        WHERE winner_id IS NOT NULL
      ),
      numbered_purchases AS (
        SELECT
          user_id,
          purchased_at,
          ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY purchased_at) AS purchase_number
        FROM purchases
      ),
      buyers AS (
        SELECT
          date_trunc($1::text, purchased_at) AS bucket_start,
          COUNT(*) AS order_count,
          COUNT(*) FILTER (WHERE purchase_number = 1) AS first_time_buyers,
          COUNT(*) FILTER (WHERE purchase_number > 1) AS returning_buyer_orders
        FROM numbered_purchases
        GROUP BY 1
      ),
      new_signups AS (
        SELECT
          date_trunc($1::text, created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')
            AS bucket_start,
          COUNT(*) AS signups
        FROM profiles
        GROUP BY 1
      )
      SELECT
        to_char(buckets.bucket_start, 'YYYY-MM-DD') AS bucket,
        COALESCE(gallery.revenue, 0) AS gallery_revenue,
        COALESCE(auction.revenue, 0) AS auction_revenue,
        COALESCE(buyers.order_count, 0)::int AS order_count,
        (COALESCE(gallery.items, 0) + COALESCE(auction.wins, 0))::int AS items_sold,
        COALESCE(new_signups.signups, 0)::int AS signups,
        COALESCE(buyers.first_time_buyers, 0)::int AS first_time_buyers,
        COALESCE(buyers.returning_buyer_orders, 0)::int AS returning_buyer_orders,
        COALESCE(to_date.buyers::numeric / NULLIF(to_date.signups, 0), 0) AS conversion_rate
      FROM buckets
      LEFT JOIN gallery USING (bucket_start)
      LEFT JOIN auction USING (bucket_start)
      LEFT JOIN buyers USING (bucket_start)
      LEFT JOIN new_signups USING (bucket_start)
      CROSS JOIN LATERAL (
        SELECT
          (SELECT COUNT(*) FROM numbered_purchases
            WHERE purchase_number = 1
              AND purchased_at < buckets.bucket_start + ('1 ' || $1::text)::interval) AS buyers,
          (SELECT COUNT(*) FROM profiles
            WHERE created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles'
              < buckets.bucket_start + ('1 ' || $1::text)::interval) AS signups
      ) AS to_date
      ORDER BY buckets.bucket_start
      `,
      [granularity, range],
    );

    return rows.map((row) => new ChartSeries(row));
  }
};
