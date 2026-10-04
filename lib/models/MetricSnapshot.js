const pool = require('../utils/pool');

module.exports = class MetricSnapshot {
  snapshotDate;
  capturedAt;
  outstandingGallery;
  outstandingAuction;
  reachableByEmail;
  inventoryForSaleCount;
  inventoryForSaleValue;
  hiddenPostCount;

  constructor(row) {
    this.snapshotDate = row.snapshot_date;
    this.capturedAt = row.captured_at;
    this.outstandingGallery = Number(row.outstanding_gallery);
    this.outstandingAuction = Number(row.outstanding_auction);
    this.reachableByEmail = row.reachable_by_email;
    this.inventoryForSaleCount = row.inventory_for_sale_count;
    this.inventoryForSaleValue = Number(row.inventory_for_sale_value);
    this.hiddenPostCount = row.hidden_post_count;
  }

  // Records today's (Pacific) balances, reachable customers and inventory.
  // Running it again the same day overwrites the row, so the last capture of
  // the day is what remains. Inventory follows the admin dashboard's
  // calculateInventoryTotals: deleted posts are skipped, hidden posts are
  // counted separately, sold posts are excluded, a discounted price wins, and a
  // price that does not start with a number counts as 0.
  static async captureToday() {
    const { rows } = await pool.query(
      `
      INSERT INTO daily_metric_snapshots (
        snapshot_date,
        outstanding_gallery,
        outstanding_auction,
        reachable_by_email,
        inventory_for_sale_count,
        inventory_for_sale_value,
        hidden_post_count
      )
      SELECT
        (NOW() AT TIME ZONE 'America/Los_Angeles')::date,
        (
          SELECT COALESCE(SUM(
            o.shipping_cost
              + COALESCE((SELECT SUM(item.price) FROM gallery_post_sales item WHERE item.order_id = o.id), 0)
          ), 0)
          FROM sales_orders o
          WHERE NOT o.is_paid
        ),
        (
          SELECT COALESCE(SUM(final_bid), 0)
          FROM auction_results
          WHERE winner_id IS NOT NULL AND is_paid IS NOT TRUE
        ),
        (SELECT COUNT(*) FROM profiles WHERE email_promotions),
        inventory.for_sale_count,
        inventory.for_sale_value,
        inventory.hidden_count
      FROM (
        SELECT
          COUNT(*) FILTER (WHERE hide IS NOT TRUE AND sold IS NOT TRUE) AS for_sale_count,
          COALESCE(SUM(selling_price) FILTER (WHERE hide IS NOT TRUE AND sold IS NOT TRUE), 0)
            AS for_sale_value,
          COUNT(*) FILTER (WHERE hide IS TRUE) AS hidden_count
        FROM (
          SELECT
            hide,
            sold,
            COALESCE(
              substring(
                CASE WHEN discounted_price <> '' THEN discounted_price ELSE price END
                FROM '^[[:space:]]*([+-]?([0-9]+[.]?[0-9]*|[.][0-9]+))'
              )::numeric,
              0
            ) AS selling_price
          FROM gallery_posts
          WHERE is_deleted IS NOT TRUE
        ) AS posts
      ) AS inventory
      ON CONFLICT (snapshot_date) DO UPDATE SET
        captured_at = NOW(),
        outstanding_gallery = EXCLUDED.outstanding_gallery,
        outstanding_auction = EXCLUDED.outstanding_auction,
        reachable_by_email = EXCLUDED.reachable_by_email,
        inventory_for_sale_count = EXCLUDED.inventory_for_sale_count,
        inventory_for_sale_value = EXCLUDED.inventory_for_sale_value,
        hidden_post_count = EXCLUDED.hidden_post_count
      RETURNING *
      `,
    );

    return new MetricSnapshot(rows[0]);
  }
};
