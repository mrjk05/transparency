-- Migration 001 — Studio integration
--
-- Prepares `reports` for being read and driven from Kadwood Studio.
--
-- Three things change:
--
--   1. `shop_domain` — Shopify order IDs and customer IDs are only unique WITHIN a store.
--      This database is reachable from kadwood.myshopify.com, limitedcollective.myshopify.com
--      (the same store under its old handle) and kaddev1.myshopify.com. Scoping by shop makes
--      the uniqueness constraint correct rather than accidentally correct, and lets the dev
--      store safely share this D1. Added now because D1/SQLite cannot alter a UNIQUE
--      constraint in place — retrofitting it later means rebuilding the table.
--
--   2. `report_orders` — a Kadwood suit is sometimes billed as TWO Shopify orders (a deposit
--      and a final payment). A passport therefore covers a commission, not an order. This
--      join table is the truth: an order belongs to at most one passport, a passport may span
--      several. `reports.shopify_order_numeric_id` is kept only as the "primary" order for
--      display (titles, filenames).
--
--   3. `rendered_at` — set whenever the PDF is (re-)rendered to R2. Studio compares it to the
--      timestamp of the copy it pushed to the member's portal in order to show
--      "portal copy is out of date".
--
-- Apply with:
--   npx wrangler d1 execute kadwood-db --file=app/db/migrations/001_studio_integration.sql
--   (add --local for the local dev database)

ALTER TABLE reports ADD COLUMN shop_domain TEXT;
ALTER TABLE reports ADD COLUMN shopify_order_numeric_id TEXT;
ALTER TABLE reports ADD COLUMN rendered_at INTEGER;

CREATE TABLE IF NOT EXISTS report_orders (
  report_id        TEXT NOT NULL REFERENCES reports(id),
  shop_domain      TEXT NOT NULL,
  order_numeric_id TEXT NOT NULL,
  order_name       TEXT,
  is_primary       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (shop_domain, order_numeric_id)
);

-- Studio looks a client's passports up by Shopify customer, scoped to the shop.
CREATE INDEX IF NOT EXISTS idx_reports_customer
  ON reports(shop_domain, shopify_customer_id);

CREATE INDEX IF NOT EXISTS idx_report_orders_report
  ON report_orders(report_id);
