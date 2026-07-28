-- Migration 002 — collapse duplicate reports
--
-- Until now the create-report action always INSERTed and never updated, while reads took
-- `ORDER BY created_at DESC LIMIT 1`. Editing a report therefore appended a row instead of
-- replacing one. Production state before this migration (2026-07-28):
--
--   #K-1116   7 rows
--   #K-1115   4 rows
--   #K-1118   3 rows
--   UNKNOWN   3 rows   <- submitted with no order attached; cannot be linked to anything
--   #K-1111   1 row
--   ------------------
--   18 rows across 4 real orders
--
-- Passports are 1:1 with a commission, so the duplicates have to go before `report_orders`
-- can enforce that. We keep the NEWEST row per order (it reflects the last edit the stylist
-- made) and delete the rest along with their answers.
--
-- The three `UNKNOWN` rows are dropped outright: with no order they cannot be attached to a
-- commission, a client, or a portal upload — they would be passports covering nothing.
--
-- Expected outcome: 4 reports survive (#K-1111, #K-1115, #K-1116, #K-1118).
--
-- Run AFTER 001. Take a backup first:
--   npx wrangler d1 export  kadwood-db --remote --output=kadwood-db-backup.sql
--   npx wrangler d1 execute kadwood-db --remote --file=app/db/migrations/002_dedupe_reports.sql
--
-- `--remote` is NOT optional on EITHER line. Both commands default to the LOCAL database and
-- still print success. Without it the "backup" is a 31-byte file containing nothing, and the
-- migration edits .wrangler/state instead of production — so the safety net is silently gone at
-- the exact moment the destructive step runs. Check the output says "remote"; if it says
-- "local", stop.
--
-- This file is re-runnable, and will need re-running: the create-report action does not gain
-- its upsert until a later PR, so duplicates keep accumulating until then. Three things to
-- know before running it:
--
--   * The answer deletions below happen BEFORE the report deletions. If the report DELETE were
--     to abort, a surviving report would be left with no answers — and `report_answers` is what
--     the passport's second page (the per-pillar evidence tables) is rendered from. What
--     prevents that is the ON DELETE CASCADE on report_orders added in 001, and nothing else:
--     without it, deleting a report already attached to an order aborts on the foreign key.
--     (An earlier revision of this file also set `PRAGMA defer_foreign_keys`. It was inert —
--     SQLite resets that pragma at each COMMIT, so outside an explicit transaction the setting
--     statement is its own transaction and the flag is gone before the next statement runs.
--     It has been removed rather than left in place looking load-bearing.)
--
--   * `wrangler d1 execute --file` IS atomic, on both paths: `--remote` uses D1's import API,
--     which restores the original state on failure, and `--local` goes through `db.batch()`,
--     which Cloudflare documents as a single transaction. A failure mid-file therefore rolls
--     back rather than leaving the database half-migrated. Take the backup anyway — that
--     covers the case this cannot, which is the migration succeeding and being wrong.
--
--   * Re-running this after a backfill can delete a report that owned a `report_orders` row.
--     The cascade cleans up the mapping, but the newly surviving report will then have no order
--     attached — RE-RUN scripts/backfill-report-orders.mjs afterwards. If that re-run fails on
--     `UNIQUE constraint failed: report_orders.shop_domain, report_orders.order_numeric_id`,
--     the order is already attached to a DIFFERENT passport; resolve which one owns it, delete
--     the stale report_orders row by hand, and re-run. (The other constraint,
--     `report_orders.report_id`, means the same passport gained a second primary order — a
--     different fault with a different fix.)

-- 1. Reports submitted without an order.
DELETE FROM report_answers
 WHERE report_id IN (SELECT id FROM reports WHERE shopify_order_id = 'UNKNOWN');

DELETE FROM reports
 WHERE shopify_order_id = 'UNKNOWN';

-- 2. Keep only the newest report per order, PER SHOP. Partitioning on the order name alone
--    deduped across stores: this database is reachable from the production store and from
--    kaddev1, and a dev passport for "#K-1116" that happened to be newer would delete the
--    production one, its answers and its order mapping. Latent while every row has a NULL
--    shop_domain (SQLite groups NULLs together, so the first run is unaffected), and live the
--    moment the backfill stamps the column and a second shop writes — which matters because
--    this file is meant to be re-run.
--
--    TRIM because "#K-1116" and "#K-1116 " are the same order to Shopify and to the backfill,
--    which trims before looking an order up; left untrimmed they survive as separate reports
--    and then collide when both resolve to one numeric order.
--
--    `id` breaks ties on identical timestamps so the two statements below always select the
--    same row.
DELETE FROM report_answers
 WHERE report_id IN (
   SELECT id FROM (
     SELECT id,
            ROW_NUMBER() OVER (
              PARTITION BY shop_domain, TRIM(shopify_order_id)
              ORDER BY created_at DESC, id DESC
            ) AS rn
       FROM reports
   ) WHERE rn > 1
 );

DELETE FROM reports
 WHERE id IN (
   SELECT id FROM (
     SELECT id,
            ROW_NUMBER() OVER (
              PARTITION BY shop_domain, TRIM(shopify_order_id)
              ORDER BY created_at DESC, id DESC
            ) AS rn
       FROM reports
   ) WHERE rn > 1
 );
