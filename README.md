# Transparency Passport - Kadwood Atelier

A Shopify embedded app that generates sustainability transparency reports for custom garments, tracking the complete supply chain from raw material to finished product.

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Scoring System](#scoring-system)
- [Database Schema](#database-schema)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Deployment](#deployment)
- [Development](#development)

---

## Overview

The Transparency Passport app creates detailed sustainability reports for each garment, scoring them across four pillars:

1. **Fibre & Material Health** (0-25 points)
2. **Traceability** (0-25 points)
3. **Social Responsibility & Labour** (0-25 points)
4. **Climate & Circularity** (0-25 points)

**Total Score:** 0-100 points

Each report includes:
- Material composition and certifications
- Supply chain traceability
- Labour and social compliance
- Carbon emissions calculations
- Transport distance tracking
- PDF export for customers

---

## System Architecture

### Technology Stack

- **Frontend:** React + Remix
- **Backend:** Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **Storage:** Cloudflare R2 (for PDFs)
- **Platform:** Shopify Embedded App
- **Auth:** Shopify OAuth 2.0

### Architecture Diagram

```
┌─────────────────┐
│  Shopify Admin  │
│   (Embedded)    │
└────────┬────────┘
         │
         ↓
┌─────────────────────────────────────┐
│   Cloudflare Workers (Remix App)    │
│  ┌──────────────────────────────┐   │
│  │  Routes:                     │   │
│  │  - /app (Order list)         │   │
│  │  - /app/create-report        │   │
│  │  - /app/passport/:id         │   │
│  │  - /api/collections          │   │
│  │  - /api/geocode              │   │
│  └──────────────────────────────┘   │
└────┬──────────────┬─────────────┬───┘
     │              │             │
     ↓              ↓             ↓
┌─────────┐  ┌──────────┐  ┌──────────┐
│ D1 (DB) │  │ R2 (PDFs)│  │ Shopify  │
│         │  │          │  │   API    │
└─────────┘  └──────────┘  └──────────┘
```

### Key Components

#### 1. **TransparencyWizard** (`app/components/TransparencyWizard.jsx`)
- Multi-step form for data collection
- Dynamic question rendering based on material type
- Real-time score calculation
- Emissions calculation engine

#### 2. **TransparencyPassportHTML** (`app/components/TransparencyPassportHTML.jsx`)
- PDF-ready HTML component
- Material-specific certification display
- Emissions visualization
- Print-optimized layout

#### 3. **Scoring Engine** (`app/config/scoring.js`)
- Defines all questions and point values
- Material-specific certifications
- Pillar configurations

---

## Scoring System

### Pillar 1: Fibre & Material Health (0-25 points)

**Dynamic Material-Specific Certifications:**

| Material | Certification 1 | Points | Certification 2 | Points |
|----------|----------------|--------|-----------------|--------|
| Wool | Woolmark Certified | 3 | RWS | 3 |
| Silk | GOTS Certified | 3 | OEKO-TEX | 3 |
| Cotton | GOTS Certified | 3 | BCI | 3 |
| Linen | European Flax | 3 | OEKO-TEX | 3 |
| Cashmere | SFA | 3 | OEKO-TEX | 3 |
| Mohair | RMS | 3 | OEKO-TEX | 3 |
| Vicuna | CITES Permit | 3 | OEKO-TEX | 3 |

**Universal Questions (All Materials):**
- Chemistry Management (Mill/Dye House): 0-5 points
- Restricted Substances Evidence: 5 points
- Lining & Trims: 0-5 points

**Implementation:**
```javascript
// Material-specific questions are generated dynamically
const getFilteredPillar1Questions = (material) => {
    const materialCerts = MATERIAL_CERTIFICATIONS[material] || [];
    const universalQuestions = ["p1_chemistry", "p1_rsl", "p1_trims"];
    return [...certQuestions, ...universalQuestions];
};
```

### Pillar 2: Traceability (0-25 points)

- Tier 1: Tailoring Facility (5 points)
- Tier 2: Fabric Mill (5 points)
- Tier 3: Raw Material Source Known (5 points)
- Batch/Roll Tracking Available (5 points)
- Supplier Transparency Agreement Signed (5 points)

### Pillar 3: Social Responsibility & Labour (0-25 points)

- Social Audit (SMETA/BSCI/SA8000): 5 points
- Country Risk Level (Modern Slavery): 5 points
- Modern Slavery Due Diligence Logged: 5 points
- Grievance/Remediation Process: 5 points

### Pillar 4: Climate & Circularity (0-25 points)

- Fibre Impact Class (Higg MSI): 5 points
- Transport Emissions (GHG Protocol): 3 points
- CO₂ Score (Distance-based): 5 points
- Longevity Design: 5 points
- Circular Offers (Repair/Take-back): 5 points
- End of Life Guidance: 5 points

**CO₂ Emissions Calculation:**

```javascript
// Emission factors (kg CO₂ per tonne-km)
const EMISSION_FACTORS = {
    Sea: 0.0075,
    Road: 0.15,
    Air: 0.9
};

// Calculate emissions for each transport leg
const calculateLegEmissions = (distance, mode) => {
    const factor = EMISSION_FACTORS[mode];
    const tonnekm = (distance * GARMENT_WEIGHT_KG) / 1000;
    return (tonnekm * factor).toFixed(2);
};
```

**CO₂ Score Bands:**
- Class A (0-5,000 km): 5 points
- Class B (5,001-10,000 km): 3 points
- Class C (10,001-20,000 km): 2 points
- Class D (20,001+ km): 0 points

---

## Database Schema

See [`DATABASE.md`](./DATABASE.md) for full ER diagram and table descriptions.

**Core Tables:**
- `suppliers` - Mills, ateliers, logistics providers
- `fabric_collections` - Fabric bunches by season
- `reports` - Transparency passport records
- `report_answers` - Audit log of all answers
- `sessions` - Shopify OAuth sessions

**Key Relationships:**
```
suppliers (1) ──→ (∞) fabric_collections
suppliers (1) ──→ (∞) reports (via mill_id)
fabric_collections (1) ──→ (∞) reports
reports (1) ──→ (∞) report_answers
```

---

## Environment Variables

### Required Variables

#### Cloudflare Workers (`wrangler.toml`)

```toml
[vars]
SCOPES = "read_all_orders,read_customers,write_customers,read_orders,write_orders"
SHOPIFY_APP_URL = "https://kadwood-transparency-engine.jinskaduthodil.workers.dev"
```

#### Cloudflare Secrets (Set via CLI)

```bash
# Shopify API Secret
wrangler secret put SHOPIFY_API_SECRET

# Optional: Mock mode for development
wrangler secret put MOCK_MODE  # Set to "true" for testing
```

#### Shopify App Configuration (`shopify.app.toml`)

```toml
client_id = "YOUR_SHOPIFY_CLIENT_ID"
name = "Transparency Passport"
application_url = "https://your-worker.workers.dev/app"
embedded = true

[access_scopes]
scopes = "read_all_orders,read_customers,write_customers,read_orders,write_orders"
```

### Cloudflare Bindings

#### D1 Database
```toml
[[d1_databases]]
binding = "DB"
database_name = "kadwood-db"
database_id = "YOUR_DATABASE_ID"
```

#### R2 Storage
```toml
[[r2_buckets]]
binding = "R2"
bucket_name = "kadwood-reports"
```

---

## API Endpoints

### Internal Routes (Remix)

#### `GET /app`
**Description:** Order list page (embedded in Shopify admin)

**Query Parameters:**
- `shop` - Shopify shop domain
- `host` - Shopify host parameter
- `session` - Session token

**Returns:** HTML page with order list

---

#### `GET /app/create-report`
**Description:** Create transparency report form

**Query Parameters:**
- `orderId` - Shopify order GID (e.g., `gid://shopify/Order/123`)
- Standard Shopify embedded app params

**Loader Data:**
```javascript
{
    suppliers: Array<Supplier>,
    orderDetails: {
        id: string,
        name: string,  // e.g., "#K-1115"
        customer: { displayName: string },
        lineItems: Array<LineItem>
    },
    existingReport: Report | null,
    existingFormData: FormData | null
}
```

**Action (POST):**
```javascript
// Request body
{
    intent: "submit_report",
    data: JSON.stringify({
        shopify_order_id: string,
        customer_name: string,
        composition: string,  // "Wool", "Silk", etc.
        mill_id: string,
        collection_id: string,
        article_code: string,
        // ... all question answers (p1_*, p2_*, p3_*, p4_*)
    }),
    scores: JSON.stringify({
        pillar_1: number,
        pillar_2: number,
        pillar_3: number,
        pillar_4: number,
        total: number
    })
}
```

**Response:**
```javascript
{
    success: true,
    reportId: string,  // UUID
    reportUrl: string  // "/app/passport/{reportId}"
}
```

---

#### `GET /app/passport/:id`
**Description:** View transparency passport PDF preview

**Parameters:**
- `id` - Report UUID

**Loader Data:**
```javascript
{
    report: {
        id: string,
        shopify_order_id: string,
        customer_name: string,
        composition: string,
        score_fibre: number,
        score_traceability: number,
        score_labour: number,
        score_climate: number,
        total_score: number,
        emissions: {
            locations: {...},
            legs: [...],
            totalDistance: number,
            emissionsKg: string
        },
        // ... other fields
    },
    answers: Array<{
        question_id: string,
        answer_value: string,
        points_awarded: number
    }>
}
```

---

### API Routes

#### `GET /api/collections`
**Description:** Fetch fabric collections for a mill

**Query Parameters:**
- `millId` - Supplier ID (integer)

**Response:**
```javascript
[
    {
        id: number,
        bunch_name: string,
        season: string
    },
    // ...
]
```

---

#### `POST /api/geocode`
**Description:** Convert address to coordinates

**Request Body:**
```javascript
{
    address: string  // e.g., "Bradford, England"
}
```

**Response:**
```javascript
{
    lat: number,
    lng: number,
    name: string,
    country: string
}
```

**Implementation:** Uses OpenStreetMap Nominatim API

---

### Shopify GraphQL Queries

#### Fetch Orders
```graphql
query GetOrders($first: Int!, $after: String) {
  orders(first: $first, after: $after, reverse: true) {
    edges {
      cursor
      node {
        id
        name
        createdAt
        customer {
          displayName
          email
        }
        lineItems(first: 10) {
          edges {
            node {
              id
              title
              quantity
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

#### Fetch Order Details with Metafields
```graphql
query GetOrder($id: ID!) {
  order(id: $id) {
    id
    name
    createdAt
    customer {
      displayName
      email
    }
    lineItems(first: 10) {
      edges {
        node {
          id
          title
          quantity
        }
      }
    }
    fabricSupplier: metafield(namespace: "custom", key: "fabric_supplier") {
      value
    }
    fabricBunch: metafield(namespace: "custom", key: "fabric_bunch") {
      value
    }
    fabricCode: metafield(namespace: "custom", key: "fabric_code") {
      value
    }
  }
}
```

#### Set Report URL Metafield
```graphql
mutation SetReportUrl($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields {
      key
      value
    }
    userErrors {
      field
      message
    }
  }
}
```

**Variables:**
```javascript
{
    metafields: [{
        ownerId: "gid://shopify/Order/123",
        namespace: "kadwood_transparency",
        key: "report_url",
        value: "https://app-url/app/passport/uuid",
        type: "url"
    }]
}
```

---

## Deployment

### Prerequisites

1. **Cloudflare Account** with Workers, D1, and R2 enabled
2. **Shopify Partner Account** with app created
3. **Node.js 18+** and npm installed
4. **Wrangler CLI** installed globally

### Initial Setup

```bash
# 1. Install dependencies
npm install

# 2. Create D1 database
wrangler d1 create kadwood-db

# 3. Update wrangler.toml with database ID

# 4. Run migrations
wrangler d1 execute DB --remote --file=./app/db/schema.sql

# 5. Create R2 bucket
wrangler r2 bucket create kadwood-reports

# 6. Set secrets
wrangler secret put SHOPIFY_API_SECRET
# Enter your Shopify API secret when prompted

# 7. Deploy
npm run deploy
```

### Deployment Command

```bash
npm run deploy
```

This runs:
1. `npm run build` - Builds Remix app
2. `wrangler deploy` - Deploys to Cloudflare Workers
3. `shopify app deploy --force` - Updates Shopify app configuration

### Environment-Specific Deployments

**Production:**
```bash
npm run deploy
```

**Development/Staging:**
```bash
# Use wrangler.toml with different bindings
wrangler deploy --env staging
```

---

## Development

### Local Development

```bash
# Start development server
npm run dev

# This runs:
# - Remix dev server with Cloudflare Workers runtime
# - Watches for file changes
# - Uses local D1 database (if configured)
```

### Database Management

```bash
# Execute SQL on remote database
wrangler d1 execute DB --remote --command "SELECT * FROM reports LIMIT 10"

# Execute SQL file
wrangler d1 execute DB --remote --file=./migrations/001_add_column.sql

# View database info
wrangler d1 info DB
```

### Viewing Logs

```bash
# Tail production logs
wrangler tail --format pretty

# Filter logs
wrangler tail --format pretty --search "ERROR"
```

### Testing

```bash
# Run tests (if configured)
npm test

# Type checking
npm run typecheck
```

---

## Project Structure

```
transparency/
├── app/
│   ├── auth/
│   │   └── verifySessionToken.server.js
│   ├── components/
│   │   ├── TransparencyWizard.jsx
│   │   └── TransparencyPassportHTML.jsx
│   ├── config/
│   │   └── scoring.js
│   ├── db/
│   │   ├── schema.sql
│   │   └── session.server.js
│   ├── routes/
│   │   ├── app._index.jsx
│   │   ├── app.create-report.jsx
│   │   ├── app.passport.$id.jsx
│   │   ├── api.collections.jsx
│   │   └── api.geocode.jsx
│   ├── entry.client.jsx
│   ├── entry.server.jsx
│   └── root.jsx
├── public/
│   └── logo.png
├── DATABASE.md
├── database-schema.mmd
├── package.json
├── remix.config.js
├── shopify.app.toml
└── wrangler.toml
```

---

## Key Features

### 1. Metafield Auto-Population
Automatically fills form fields from Shopify order metafields:
- `custom.fabric_supplier` → Fabric Mill
- `custom.fabric_bunch` → Collection (with fuzzy matching)
- `custom.fabric_code` → Article Code

### 2. Material-Specific Certifications
Dynamically shows relevant certifications based on material composition:
- Wool → Woolmark, RWS
- Silk → GOTS, OEKO-TEX
- Cotton → GOTS, BCI
- etc.

### 3. Emissions Calculation
Calculates CO₂ emissions based on:
- Material primary production location
- Mill location
- Garment construction location
- Warehouse location
- Transport modes (Sea, Road, Air)

### 4. PDF Generation
Creates print-ready PDF with:
- Material-specific certifications
- Supply chain visualization
- Emissions breakdown
- Scoring details

---

## Troubleshooting

### Common Issues

**Issue:** "Application Error" when loading form

**Solution:** Check that `useCallback` is not used in server components. Use regular functions instead.

---

**Issue:** Pillar 1 certifications showing 0 points

**Solution:** Ensure material-specific questions are used in:
1. Form UI (`getFilteredPillar1Questions`)
2. Score calculation
3. Database saving (action handler)
4. PDF display

---

**Issue:** Collections not loading when mill auto-populated

**Solution:** Add `useEffect` to watch `formData.mill_id` and fetch collections when it changes.

---

## License

Proprietary - Kadwood Atelier

---

## Support

For issues or questions, contact the development team.
