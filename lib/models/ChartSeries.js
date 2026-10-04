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
  piecesPosted;
  piecesSold;
  medianDaysToSell;
  auctionsClosed;
  auctionSellThrough;
  buyNowShare;
  finalOverStart;
  bidsPerAuction;
  uniqueBidders;

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
    this.piecesPosted = row.pieces_posted;
    this.piecesSold = row.pieces_sold;
    this.medianDaysToSell =
      row.median_days_to_sell === null ? null : Number(row.median_days_to_sell);
    this.auctionsClosed = row.auctions_closed;
    this.auctionSellThrough =
      row.auction_sell_through === null ? null : Number(row.auction_sell_through);
    this.buyNowShare = row.buy_now_share === null ? null : Number(row.buy_now_share);
    this.finalOverStart = row.final_over_start === null ? null : Number(row.final_over_start);
    this.bidsPerAuction = row.bids_per_auction === null ? null : Number(row.bids_per_auction);
    this.uniqueBidders = row.unique_bidders;
  }

  // One row per day, week or month in Pacific time, oldest first. Timestamp
  // columns are naive UTC, so they are converted before truncating; otherwise a
  // 6pm sale on the 31st lands in the next month. Periods with no sales are 0.
  // Conversion is buyers over signups as of the end of each period, counting
  // all history before the range, and 0 before the first signup. A piece deleted
  // in the period it was posted is not counted as posted. Median days to sell is
  // null for a period with no sales. Auction ratios are null for a period with
  // nothing to divide by. Bids per auction counts bids on the auctions that
  // closed in the period; unique bidders is by the date of the bid.
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
                FROM auction_results),
              (SELECT MIN(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')
                FROM bids),
              (SELECT MIN(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')
                FROM profiles),
              (SELECT MIN(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')
                FROM gallery_posts)
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
      ),
      posted AS (
        SELECT
          date_trunc($1::text, created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')
            AS bucket_start,
          COUNT(*) AS pieces
        FROM gallery_posts
        WHERE deleted_at IS NULL
          OR date_trunc($1::text, deleted_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')
            <> date_trunc($1::text, created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')
        GROUP BY 1
      ),
      sold AS (
        SELECT
          date_trunc($1::text, sale.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')
            AS bucket_start,
          COUNT(*) AS pieces,
          PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM sale.created_at - post.created_at) / 86400
          ) AS median_days_to_sell
        FROM gallery_post_sales sale
        JOIN gallery_posts post ON post.id = sale.post_id
        GROUP BY 1
      ),
      bid_totals AS (
        SELECT auction_id, COUNT(*) AS bid_count
        FROM bids
        GROUP BY auction_id
      ),
      auction_health AS (
        SELECT
          date_trunc($1::text, result.closed_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')
            AS bucket_start,
          COUNT(*) AS closed,
          COUNT(*) FILTER (WHERE result.winner_id IS NOT NULL) AS won,
          COUNT(*) FILTER (
            WHERE result.winner_id IS NOT NULL AND result.closed_reason = 'buy_now'
          ) AS bought_now,
          AVG(result.final_bid / NULLIF(auction.start_price, 0)) FILTER (
            WHERE result.winner_id IS NOT NULL
          ) AS final_over_start,
          SUM(COALESCE(bid_totals.bid_count, 0)) AS bid_count
        FROM auction_results result
        JOIN auctions auction ON auction.id = result.auction_id
        LEFT JOIN bid_totals ON bid_totals.auction_id = result.auction_id
        GROUP BY 1
      ),
      bidders AS (
        SELECT
          date_trunc($1::text, created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')
            AS bucket_start,
          COUNT(DISTINCT user_id) AS unique_bidders
        FROM bids
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
        COALESCE(to_date.buyers::numeric / NULLIF(to_date.signups, 0), 0) AS conversion_rate,
        COALESCE(posted.pieces, 0)::int AS pieces_posted,
        COALESCE(sold.pieces, 0)::int AS pieces_sold,
        sold.median_days_to_sell,
        COALESCE(auction_health.closed, 0)::int AS auctions_closed,
        auction_health.won::numeric / NULLIF(auction_health.closed, 0) AS auction_sell_through,
        auction_health.bought_now::numeric / NULLIF(auction_health.won, 0) AS buy_now_share,
        auction_health.final_over_start,
        auction_health.bid_count::numeric / NULLIF(auction_health.closed, 0) AS bids_per_auction,
        COALESCE(bidders.unique_bidders, 0)::int AS unique_bidders
      FROM buckets
      LEFT JOIN gallery USING (bucket_start)
      LEFT JOIN auction USING (bucket_start)
      LEFT JOIN buyers USING (bucket_start)
      LEFT JOIN new_signups USING (bucket_start)
      LEFT JOIN posted USING (bucket_start)
      LEFT JOIN sold USING (bucket_start)
      LEFT JOIN auction_health USING (bucket_start)
      LEFT JOIN bidders USING (bucket_start)
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
