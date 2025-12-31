# Database Schema - Transparency Passport

## Entity Relationship Diagram

```mermaid
erDiagram
    suppliers ||--o{ fabric_collections : "has many"
    suppliers ||--o{ reports : "supplies fabric for"
    fabric_collections ||--o{ reports : "used in"
    reports ||--o{ report_answers : "has many"
    
    suppliers {
        INTEGER id PK "Auto-increment"
        TEXT name "Supplier name"
        TEXT type "Mill, Atelier, or Logistics"
        TEXT country "Country of operation"
        TEXT mill_location "Specific location"
        REAL lat "Latitude coordinate"
        REAL lng "Longitude coordinate"
        BOOLEAN woolmark_certified "Woolmark certification status"
        BOOLEAN rws_certified "RWS certification status"
        TEXT sustainability_data "JSON pillar answers"
    }
    
    fabric_collections {
        INTEGER id PK "Auto-increment"
        INTEGER supplier_id FK "References suppliers(id)"
        TEXT bunch_name "Collection/bunch name"
        TEXT season "e.g., AW 2025"
    }
    
    reports {
        TEXT id PK "UUID"
        TEXT shopify_order_id "Shopify order ID"
        TEXT shopify_line_item_id "Specific line item"
        TEXT shopify_customer_id "Customer ID"
        TEXT customer_name "Customer display name"
        TEXT suit_id "Format: KAD-YEAR-ORDER"
        TEXT item_name "Product name"
        INTEGER mill_id FK "References suppliers(id)"
        INTEGER collection_id FK "References fabric_collections(id)"
        TEXT article_code "Fabric article code"
        TEXT composition "e.g., 100% Wool, Silk"
        INTEGER score_fibre "Pillar 1 score (0-25)"
        INTEGER score_traceability "Pillar 2 score (0-25)"
        INTEGER score_labour "Pillar 3 score (0-25)"
        INTEGER score_climate "Pillar 4 score (0-25)"
        INTEGER total_score "Total score (0-100)"
        TEXT emissions "JSON emissions data"
        TEXT pdf_r2_key "R2 storage key"
        TEXT pdf_public_url "Public PDF URL"
        DATETIME created_at "Timestamp"
    }
    
    report_answers {
        TEXT report_id FK "References reports(id)"
        TEXT question_id "Question identifier"
        TEXT answer_value "Answer value"
        INTEGER points_awarded "Points for this answer"
    }
    
    sessions {
        TEXT id PK "Session ID"
        TEXT shop "Shopify shop domain"
        TEXT state "OAuth state"
        INTEGER isOnline "Online session flag"
        TEXT scope "OAuth scopes"
        INTEGER expires "Expiration timestamp"
        TEXT accessToken "Shopify access token"
        BIGINT userId "Shopify user ID"
    }
```

## Table Descriptions

### suppliers
Stores information about fabric mills, ateliers, and logistics providers.

**Key Relationships:**
- One supplier can have many fabric collections
- One supplier can be referenced by many reports (as the mill)

**Special Fields:**
- `sustainability_data`: JSON string containing pre-filled sustainability answers for the supplier

### fabric_collections
Fabric bunches/collections from suppliers, organized by season.

**Key Relationships:**
- Each collection belongs to one supplier
- One collection can be used in many reports

### reports
Core table storing transparency passport reports for each garment.

**Key Relationships:**
- References `suppliers` via `mill_id`
- References `fabric_collections` via `collection_id`
- Has many `report_answers`

**Scoring Fields:**
- `score_fibre`: Pillar 1 - Fibre & Material Health (0-25)
- `score_traceability`: Pillar 2 - Traceability (0-25)
- `score_labour`: Pillar 3 - Social Responsibility & Labour (0-25)
- `score_climate`: Pillar 4 - Climate & Circularity (0-25)
- `total_score`: Sum of all pillars (0-100)

**Emissions Field:**
- JSON structure containing:
  - `locations`: Primary, mill, production, warehouse coordinates
  - `legs`: Transport segments with distance, mode, emissions
  - `totalDistance`: Total km traveled
  - `emissionsKg`: Total CO₂ emissions

### report_answers
Audit log of all question answers for each report.

**Key Relationships:**
- Each answer belongs to one report
- Multiple answers per report (one per question answered)

**Purpose:**
- Enables detailed breakdown of scoring in PDF
- Provides audit trail
- Allows for score recalculation if needed

### sessions
OAuth session management for Shopify app authentication.

**Purpose:**
- Stores Shopify access tokens
- Manages session expiration
- Tracks online/offline sessions

## Indexes

Recommended indexes for performance:
- `reports(shopify_order_id)` - Fast order lookup
- `report_answers(report_id)` - Fast answer retrieval
- `fabric_collections(supplier_id)` - Fast collection filtering
- `sessions(shop)` - Fast session lookup
