DROP TABLE IF EXISTS report_answers;
DROP TABLE IF EXISTS reports;
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
CREATE TABLE reports (
  id TEXT PRIMARY KEY, -- UUID
  shopify_order_id TEXT NOT NULL, 
  shopify_line_item_id TEXT, -- Specific item in the order
  shopify_customer_id TEXT,
  suit_id TEXT NOT NULL, -- Format: KAD-YEAR-ORDER
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
  pdf_r2_key TEXT, -- Storage key
  pdf_public_url TEXT,
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
