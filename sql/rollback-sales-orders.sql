-- Emergency down-migration for backfill-sales-orders.sql. Run by hand, only to get the
-- database back to the shape v1.0.0 code expects.
--
-- Run this BEFORE deploying v1.0.0 code, not after. Old code against the new schema fails
-- on every sales route.
--
-- Lossy, on purpose:
--   * shipping_cost is discarded. The old schema has nowhere to hold it.
--   * A multi-piece order becomes one sale row per piece, each carrying the order's buyer,
--     paid state and tracking. That is the old shape, so this is expected, but the fact
--     that those rows were one shipment is gone.
--
-- Take a database backup first regardless. This is the fast path back, not the safe one.

BEGIN;

ALTER TABLE gallery_post_sales
  ADD COLUMN buyer_id INTEGER REFERENCES users_admin(id),
  ADD COLUMN tracking_number TEXT,
  ADD COLUMN is_paid BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN paid_at TIMESTAMP,
  ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();

UPDATE gallery_post_sales sale
SET
  buyer_id = parent_order.buyer_id,
  tracking_number = parent_order.tracking_number,
  is_paid = parent_order.is_paid,
  paid_at = parent_order.paid_at,
  updated_at = parent_order.updated_at
FROM sales_orders parent_order
WHERE parent_order.id = sale.order_id;

ALTER TABLE gallery_post_sales
  ALTER COLUMN buyer_id SET NOT NULL;

DROP INDEX IF EXISTS gallery_post_sales_order_id_idx;
DROP INDEX IF EXISTS gallery_post_sales_post_id_idx;

ALTER TABLE gallery_post_sales
  DROP COLUMN order_id;

DROP TABLE sales_orders;

COMMIT;
