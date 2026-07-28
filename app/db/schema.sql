-- Bootstrap schema for a FRESH database. This drops and recreates everything — never run it
-- against production. Incremental changes to an existing database live in db/migrations/.
DROP TABLE IF EXISTS report_orders;
DROP TABLE IF EXISTS report_answers;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS sessions;
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  shop TEXT,
  state TEXT,
  isOnline INTEGER,
  scope TEXT,
  expires INTEGER,
  accessToken TEXT,
  userId BIGINT
);

DROP TABLE IF EXISTS fabric_collections;
DROP TABLE IF EXISTS suppliers;

-- 1. Suppliers (Mills & Ateliers)
CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, 
  type TEXT NOT NULL, -- 'Mill', 'Atelier', 'Logistics'
  country TEXT NOT NULL,
  mill_location TEXT,
  lat REAL,
  lng REAL,
  woolmark_certified BOOLEAN DEFAULT 0,
  rws_certified BOOLEAN DEFAULT 0,
  sustainability_data TEXT -- JSON string of pillar answers
);

-- 2. Fabric Collections (Bunches)
CREATE TABLE fabric_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER,
  bunch_name TEXT NOT NULL, 
  season TEXT, -- e.g., 'AW 2025'
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

-- 3. Reports (The Transparency Record)
--    One report = one commission. A commission may span several Shopify orders (Kadwood bills
--    a deposit and a final payment separately) — see report_orders below, which is the truth
--    about which orders a passport covers.
CREATE TABLE reports (
  id TEXT PRIMARY KEY, -- UUID
  shop_domain TEXT, -- owning Shopify store; order/customer IDs are only unique within one
  shopify_order_id TEXT NOT NULL, -- order NAME, e.g. "#K-1116" (display only)
  shopify_order_numeric_id TEXT, -- primary order's stable numeric ID (display/title only)
  shopify_line_item_id TEXT, -- vestigial: a passport covers the order, not one line item
  shopify_customer_id TEXT, -- denormalised so Studio can list a client's passports in one query
  customer_name TEXT, -- Customer display name
  suit_id TEXT NOT NULL, -- the order name the customer recognises, e.g. "#K-1116"
  item_name TEXT,
  
  -- Fabric Details
  mill_id INTEGER,
  collection_id INTEGER,
  article_code TEXT, 
  composition TEXT, -- e.g. "100% Wool"
  
  -- Scores (0-25 per pillar)
  score_fibre INTEGER,
  score_traceability INTEGER,
  score_labour INTEGER,
  score_climate INTEGER,
  total_score INTEGER, -- (0-100)
  emissions TEXT, -- JSON string of emissions data
  
  -- Output
  pdf_r2_key TEXT, -- Storage key in the kadwood-reports bucket
  pdf_public_url TEXT,
  rendered_at INTEGER, -- last PDF render; Studio compares this to its portal copy
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Answers (Audit Log)
CREATE TABLE report_answers (
  report_id TEXT,
  question_id TEXT,
  answer_value TEXT,
  points_awarded INTEGER,
  FOREIGN KEY (report_id) REFERENCES reports(id)
);

-- 5. Orders covered by a report
--    An order belongs to at most one passport (enforced by the UNIQUE below); a passport may
--    cover several orders, which is how a deposit + final-payment pair stays one passport.
CREATE TABLE report_orders (
  report_id        TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  shop_domain      TEXT NOT NULL,
  order_numeric_id TEXT NOT NULL,
  order_name       TEXT,
  -- the order used for titles and filenames; CHECK because the partial index below only
  -- constrains the literal 1, so an is_primary of 2 would slip past it
  is_primary       INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  UNIQUE (shop_domain, order_numeric_id)
);

CREATE INDEX idx_reports_customer ON reports(shop_domain, shopify_customer_id);
CREATE INDEX idx_report_orders_report ON report_orders(report_id);
-- At most one order names each passport. Not "exactly one" — a report may have orders attached
-- with no primary among them, and nothing here prevents that.
CREATE UNIQUE INDEX idx_report_orders_one_primary ON report_orders(report_id) WHERE is_primary = 1;
