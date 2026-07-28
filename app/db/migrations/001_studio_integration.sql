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
-- NOT re-runnable. SQLite has no `ADD COLUMN IF NOT EXISTS`, so a second run fails on
-- "duplicate column name" at the first ALTER. That is deliberate — a half-applied migration
-- should be noisy — but it means this file is one-shot. (These migrations are applied by hand
-- rather than through `wrangler d1 migrations apply`: the project has no `migrations_dir` and
-- no `d1_migrations` ledger, so nothing tracks what has been applied. Check before running.)
--
-- Apply with:
--   npx wrangler d1 execute kadwood-db --remote --file=app/db/migrations/001_studio_integration.sql
--
-- `--remote` is NOT optional. `wrangler d1 execute` defaults to the LOCAL database in
-- .wrangler/state — verified on 3.114.15, which prints "Executing on local database" and exits
-- 0. Omit it and this migration reports complete success while production is untouched.

ALTER TABLE reports ADD COLUMN shop_domain TEXT;
ALTER TABLE reports ADD COLUMN shopify_order_numeric_id TEXT;
ALTER TABLE reports ADD COLUMN rendered_at INTEGER;

-- ON DELETE CASCADE is load-bearing, not decoration. Migration 002 deletes reports, and any
-- report already carrying an attachment would otherwise abort that DELETE on a foreign-key
-- violation — after the answer deletion ahead of it had already committed, leaving a surviving
-- report stripped of the evidence its second page is rendered from.
CREATE TABLE IF NOT EXISTS report_orders (
  report_id        TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  shop_domain      TEXT NOT NULL,
  order_numeric_id TEXT NOT NULL,
  order_name       TEXT,
  -- CHECK, not just a default: the partial index below constrains the literal 1, so without
  -- this an is_primary of 2 slips past it entirely and any code written as `WHERE is_primary`
  -- (SQLite truthiness) would see two primaries. Same argument as shop_domain — SQLite cannot
  -- add a CHECK in place later, so it costs one line now and a table rebuild afterwards.
  is_primary       INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  UNIQUE (shop_domain, order_numeric_id)
);

-- A passport may span several orders, but AT MOST one of them names it (titles, filenames, the
-- customer-facing order reference). Note "at most", not "exactly": a report can legitimately
-- have orders attached and no primary among them, and nothing here prevents that.
CREATE UNIQUE INDEX IF NOT EXISTS idx_report_orders_one_primary
  ON report_orders(report_id) WHERE is_primary = 1;

-- Studio looks a client's passports up by Shopify customer, scoped to the shop.
CREATE INDEX IF NOT EXISTS idx_reports_customer
  ON reports(shop_domain, shopify_customer_id);

CREATE INDEX IF NOT EXISTS idx_report_orders_report
  ON report_orders(report_id);
