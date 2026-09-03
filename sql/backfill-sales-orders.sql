-- One-off backfill for the deployed database. Run by hand, once.
--
-- Run the whole file in one execution (in Beekeeper Studio, paste it all into one
-- query tab and run that tab). It opens with BEGIN and ends with COMMIT, so running it a
-- statement at a time leaves an open transaction holding locks.
--
-- Moves buyer_id / is_paid / paid_at / tracking_number off gallery_post_sales and onto
-- a new sales_orders parent. Every existing sale becomes its own single-item order with
-- shipping_cost 0, since shipping was previously folded into the piece price.

BEGIN;

CREATE TABLE sales_orders (
  id SERIAL PRIMARY KEY,
  buyer_id INTEGER NOT NULL REFERENCES users_admin(id),
  shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  tracking_number TEXT,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE gallery_post_sales
  ADD COLUMN order_id INTEGER REFERENCES sales_orders(id) ON DELETE CASCADE;

-- One order per existing sale row, remembering which sale it came from so the
-- order_id can be written back without a second guess at the match.
WITH inserted AS (
  INSERT INTO sales_orders (buyer_id, shipping_cost, tracking_number, is_paid, paid_at, created_at, updated_at)
  SELECT
    sale.buyer_id,
    0,
    sale.tracking_number,
    sale.is_paid,
    sale.paid_at,
    sale.created_at,
    COALESCE(sale.updated_at, sale.created_at)
  FROM gallery_post_sales sale
  ORDER BY sale.id
  RETURNING id AS order_id
),
numbered_orders AS (
  SELECT order_id, ROW_NUMBER() OVER (ORDER BY order_id) AS position FROM inserted
),
numbered_sales AS (
  SELECT id AS sale_id, ROW_NUMBER() OVER (ORDER BY id) AS position FROM gallery_post_sales
)
UPDATE gallery_post_sales sale
SET order_id = numbered_orders.order_id
FROM numbered_sales
JOIN numbered_orders ON numbered_orders.position = numbered_sales.position
WHERE sale.id = numbered_sales.sale_id;

ALTER TABLE gallery_post_sales
  ALTER COLUMN order_id SET NOT NULL;

ALTER TABLE gallery_post_sales
  DROP COLUMN buyer_id,
  DROP COLUMN tracking_number,
  DROP COLUMN is_paid,
  DROP COLUMN paid_at;

ALTER TABLE gallery_post_sales
  DROP COLUMN IF EXISTS updated_at;

CREATE INDEX sales_orders_buyer_id_idx ON sales_orders(buyer_id);
CREATE INDEX gallery_post_sales_order_id_idx ON gallery_post_sales(order_id);
CREATE INDEX gallery_post_sales_post_id_idx ON gallery_post_sales(post_id);

COMMIT;
