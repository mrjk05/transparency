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
--   npx wrangler d1 export kadwood-db --output=kadwood-db-backup.sql
--   npx wrangler d1 execute kadwood-db --file=app/db/migrations/002_dedupe_reports.sql

-- 1. Reports submitted without an order.
DELETE FROM report_answers
 WHERE report_id IN (SELECT id FROM reports WHERE shopify_order_id = 'UNKNOWN');

DELETE FROM reports
 WHERE shopify_order_id = 'UNKNOWN';

-- 2. Keep only the newest report per order. `id` breaks ties on identical timestamps so the
--    two statements below always select the same row.
DELETE FROM report_answers
 WHERE report_id IN (
   SELECT id FROM (
     SELECT id,
            ROW_NUMBER() OVER (
              PARTITION BY shopify_order_id
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
              PARTITION BY shopify_order_id
              ORDER BY created_at DESC, id DESC
            ) AS rn
       FROM reports
   ) WHERE rn > 1
 );
