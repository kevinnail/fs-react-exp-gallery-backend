const pool = require('../utils/pool');

module.exports = class ChartSeries {
  bucket;
  galleryRevenue;
  auctionRevenue;

  constructor(row) {
    this.bucket = row.bucket;
    this.galleryRevenue = Number(row.gallery_revenue);
    this.auctionRevenue = Number(row.auction_revenue);
  }

  // One row per day, week or month in Pacific time, oldest first. Timestamp
  // columns are naive UTC, so they are converted before truncating; otherwise a
  // 6pm sale on the 31st lands in the next month. Periods with no sales are 0.
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
                FROM auction_results WHERE winner_id IS NOT NULL)
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
          o.shipping_cost + COALESCE(SUM(item.price), 0) AS order_total
        FROM sales_orders o
        LEFT JOIN gallery_post_sales item ON item.order_id = o.id
        GROUP BY o.id
      ),
      gallery AS (
        SELECT bucket_start, SUM(order_total) AS revenue
        FROM gallery_orders
        GROUP BY bucket_start
      ),
      auction AS (
        SELECT
          date_trunc($1::text, closed_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')
            AS bucket_start,
          SUM(final_bid) AS revenue
        FROM auction_results
        WHERE winner_id IS NOT NULL
        GROUP BY 1
      )
      SELECT
        to_char(buckets.bucket_start, 'YYYY-MM-DD') AS bucket,
        COALESCE(gallery.revenue, 0) AS gallery_revenue,
        COALESCE(auction.revenue, 0) AS auction_revenue
      FROM buckets
      LEFT JOIN gallery USING (bucket_start)
      LEFT JOIN auction USING (bucket_start)
      ORDER BY buckets.bucket_start
      `,
      [granularity, range],
    );

    return rows.map((row) => new ChartSeries(row));
  }
};
