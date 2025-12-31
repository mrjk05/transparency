# AI Agent Guide - Transparency Passport

This guide helps AI agents quickly understand and work with the Transparency Passport codebase.

## Quick Start

**Project Type:** Shopify Embedded App (Remix + Cloudflare Workers)

**Purpose:** Generate sustainability transparency reports for custom garments with scoring across 4 pillars.

**Tech Stack:** React, Remix, Cloudflare Workers, D1 (SQLite), R2, Shopify API

---

## Critical Concepts

### 1. Material-Specific Pillar 1 Questions

**⚠️ MOST IMPORTANT:** Pillar 1 certifications are **DYNAMIC** based on material composition.

**DO NOT** use static `SCORING_CONFIG` questions for Pillar 1. **ALWAYS** use:

```javascript
getFilteredPillar1Questions(material)
```

**This function must be used in 4 places:**

1. ✅ **Form UI** - [`TransparencyWizard.jsx`](file:///Users/jins/Code/shopify/transparency/app/components/TransparencyWizard.jsx#L506-L508)
2. ✅ **Score Calculation** - [`TransparencyWizard.jsx`](file:///Users/jins/Code/shopify/transparency/app/components/TransparencyWizard.jsx#L148-L151)
3. ✅ **Database Saving** - [`app.create-report.jsx`](file:///Users/jins/Code/shopify/transparency/app/routes/app.create-report.jsx#L461-L465)
4. ✅ **PDF Display** - [`TransparencyPassportHTML.jsx`](file:///Users/jins/Code/shopify/transparency/app/components/TransparencyPassportHTML.jsx#L367-L372)

**Material Certifications:**
- Wool → Woolmark, RWS
- Silk → GOTS, OEKO-TEX
- Cotton → GOTS, BCI
- Linen → European Flax, OEKO-TEX
- Cashmere → SFA, OEKO-TEX
- Mohair → RMS, OEKO-TEX
- Vicuna → CITES Permit, OEKO-TEX

---

### 2. Server vs Client Components

**⚠️ CRITICAL:** This is a Remix app running on Cloudflare Workers.

**DO NOT** use React hooks like `useCallback`, `useMemo` in server components.

**Server Components:** Routes (loaders, actions)
**Client Components:** Components in `app/components/`

If you need to memoize a function, use a regular function and exclude it from `useEffect` dependency arrays.

---

### 3. Database Schema

**Tables:**
- `suppliers` - Mills, ateliers (has certifications)
- `fabric_collections` - Fabric bunches by season
- `reports` - Main transparency records
- `report_answers` - Audit log of all answers
- `sessions` - OAuth sessions

**Key Foreign Keys:**
- `fabric_collections.supplier_id` → `suppliers.id`
- `reports.mill_id` → `suppliers.id`
- `reports.collection_id` → `fabric_collections.id`
- `report_answers.report_id` → `reports.id`

**⚠️ Common Mistake:** Using `mill_id` instead of `supplier_id` in fabric_collections queries.

---

## File Structure & Responsibilities

### Core Files

#### [`app/config/scoring.js`](file:///Users/jins/Code/shopify/transparency/app/config/scoring.js)
**Purpose:** Defines all questions, point values, and material certifications

**Exports:**
- `SCORING_CONFIG` - Array of 4 pillars with questions
- `MATERIAL_CERTIFICATIONS` - Object mapping materials to certifications

**When to Edit:**
- Adding new questions
- Changing point values
- Adding new materials
- Modifying certifications

---

#### [`app/components/TransparencyWizard.jsx`](file:///Users/jins/Code/shopify/transparency/app/components/TransparencyWizard.jsx)
**Purpose:** Multi-step form for data collection

**Key Functions:**
- `getFilteredPillar1Questions(material)` - Returns material-specific questions
- `calculateQuestionScore(question, answer)` - Calculates points for an answer
- `calculateEmissions()` - Computes transport emissions
- `handleSubmit()` - Submits form data

**State Management:**
- `formData` - All form answers
- `scores` - Calculated pillar scores
- `material` - Current material composition (synced with `formData.composition`)
- `emissionsData` - Calculated emissions

**⚠️ Important:**
- `material` state must sync with `formData.composition` via useEffect
- Collections must be fetched when `mill_id` changes (even on auto-populate)

---

#### [`app/components/TransparencyPassportHTML.jsx`](file:///Users/jins/Code/shopify/transparency/app/components/TransparencyPassportHTML.jsx)
**Purpose:** PDF-ready HTML component

**Props:**
- `data` - Report data from database
- `scores` - Pillar scores
- `answers` - Array of question answers

**Key Functions:**
- `getFilteredPillar1Questions(material)` - Same as Wizard
- `getAnswerText(question, answerValue)` - Formats answer for display

**Rendering:**
- Page 1: Summary with scores
- Page 2: Detailed pillar breakdown

---

#### [`app/routes/app.create-report.jsx`](file:///Users/jins/Code/shopify/transparency/app/routes/app.create-report.jsx)
**Purpose:** Create/edit transparency reports

**Loader:**
- Fetches order details from Shopify
- Loads suppliers and collections
- Auto-populates from metafields
- Checks for existing report

**Action:**
- Saves report to database
- Saves all answers to `report_answers`
- Sets metafield on Shopify order
- Returns report ID for navigation

**⚠️ Critical:**
- Must use `getFilteredPillar1Questions(rawData.composition)` when saving answers
- Metafield auto-population uses fuzzy matching for collection names

---

## Common Tasks

### Adding a New Question

1. **Edit [`app/config/scoring.js`](file:///Users/jins/Code/shopify/transparency/app/config/scoring.js)**
   ```javascript
   {
       id: "p1_new_question",
       label: "New Question?",
       type: "checkbox",  // or "select"
       options: [
           { label: "Yes", value: "yes", points: 5 }
       ]
   }
   ```

2. **No other changes needed** - The system automatically:
   - Renders the question in the form
   - Calculates the score
   - Saves the answer
   - Displays it in the PDF

---

### Adding a New Material

1. **Edit [`app/config/scoring.js`](file:///Users/jins/Code/shopify/transparency/app/config/scoring.js)**
   ```javascript
   export const MATERIAL_CERTIFICATIONS = {
       // ... existing materials
       "NewMaterial": [
           { id: "cert1", label: "Certification 1?", points: 3 },
           { id: "cert2", label: "Certification 2?", points: 3 }
       ]
   };
   ```

2. **Add primary location** in [`TransparencyWizard.jsx`](file:///Users/jins/Code/shopify/transparency/app/components/TransparencyWizard.jsx)
   ```javascript
   const getPrimaryLocation = (material) => {
       switch (material) {
           // ... existing cases
           case "NewMaterial": 
               return { 
                   lat: X, 
                   lng: Y, 
                   name: "Location", 
                   country: "Country" 
               };
       }
   };
   ```

3. **Add to material options** in [`TransparencyWizard.jsx`](file:///Users/jins/Code/shopify/transparency/app/components/TransparencyWizard.jsx)
   ```javascript
   const materialOptions = [
       // ... existing options
       { label: "NewMaterial", value: "NewMaterial" }
   ];
   ```

---

### Debugging Score Calculation

**Issue:** Scores not calculating correctly

**Check:**
1. Is `getFilteredPillar1Questions` being used for Pillar 1?
2. Is `material` state synced with `formData.composition`?
3. Are question IDs matching between form and scoring config?
4. Check browser console for calculation errors

**Debug Logging:**
```javascript
// In TransparencyWizard.jsx useEffect for score calculation
console.log('Calculating scores for material:', material);
console.log('Pillar 1 questions:', getFilteredPillar1Questions(material));
console.log('Form data:', formData);
```

---

### Debugging Database Issues

**Issue:** Answers not saving

**Check:**
1. Is action handler using `getFilteredPillar1Questions` for Pillar 1?
2. Are answers being passed in `rawData`?
3. Check wrangler tail logs for SQL errors

**Query Database:**
```bash
# Check saved answers
wrangler d1 execute DB --remote --command \
  "SELECT * FROM report_answers WHERE report_id = 'UUID' ORDER BY question_id"

# Check report
wrangler d1 execute DB --remote --command \
  "SELECT * FROM reports WHERE id = 'UUID'"
```

---

## Scoring Logic Deep Dive

### Score Calculation Flow

```
User fills form
    ↓
formData updates
    ↓
useEffect triggers (watches formData, material)
    ↓
For each pillar:
    - Get questions (dynamic for Pillar 1)
    - For each question:
        - Get answer from formData
        - Calculate points via calculateQuestionScore()
    - Sum points (capped at pillar max_score)
    ↓
Update scores state
    ↓
Display in UI
```

### calculateQuestionScore Logic

```javascript
const calculateQuestionScore = useCallback((question, answer) => {
    // Readonly score - answer IS the score
    if (question.type === "readonly_score") {
        return parseInt(answer, 10) || 0;
    }
    
    if (!answer) return 0;
    
    // Checkbox - yes/no
    if (question.type === "checkbox") {
        return answer ? (question.options[0]?.points || 0) : 0;
    }
    
    // Select - find matching option
    if (question.type === "select") {
        const option = question.options.find(opt => opt.value === answer);
        return option ? option.points : 0;
    }
    
    // Dynamic lookup - supplier exists = 5 points
    if (question.type === "dynamic_lookup") {
        return answer ? 5 : 0;
    }
    
    return 0;
}, []);
```

---

## Emissions Calculation

### Transport Legs

1. **Primary Production → Mill**
   - From: Material-specific location (e.g., Australia for Wool)
   - To: Selected mill location
   - Mode: Sea (default)

2. **Mill → Garment Construction**
   - From: Mill location
   - To: Production facility (default: Prostějov, Czechia)
   - Mode: Road

3. **Garment Construction → Warehouse**
   - From: Production facility
   - To: Warehouse (default: Sydney, Australia)
   - Mode: Air

### Emission Factors

```javascript
const EMISSION_FACTORS = {
    Sea: 0.0075,   // kg CO₂ per tonne-km
    Road: 0.15,    // kg CO₂ per tonne-km
    Air: 0.9       // kg CO₂ per tonne-km
};

const GARMENT_WEIGHT_KG = 1.5;  // Average suit weight
```

### Calculation Formula

```javascript
// For each leg:
const tonnekm = (distance_km * GARMENT_WEIGHT_KG) / 1000;
const emissions_kg = tonnekm * EMISSION_FACTORS[mode];
```

---

## Metafield Auto-Population

### Shopify Metafields Used

- `custom.fabric_supplier` → Mill name
- `custom.fabric_bunch` → Collection name
- `custom.fabric_code` → Article code

### Fuzzy Matching Algorithm

```javascript
// Levenshtein distance for string similarity
function levenshteinDistance(a, b) {
    // ... implementation
}

// Find closest collection match
function findClosestCollection(targetName, collections) {
    let bestMatch = null;
    let lowestDistance = Infinity;
    
    for (const collection of collections) {
        const distance = levenshteinDistance(
            targetName.toLowerCase(),
            collection.bunch_name.toLowerCase()
        );
        
        if (distance < lowestDistance) {
            lowestDistance = distance;
            bestMatch = collection;
        }
    }
    
    // Accept if similarity > 70%
    const maxLen = Math.max(targetName.length, bestMatch.bunch_name.length);
    const similarity = 1 - (lowestDistance / maxLen);
    
    return similarity > 0.7 ? bestMatch : null;
}
```

---

## Common Pitfalls

### ❌ Using Static Questions for Pillar 1

```javascript
// WRONG
SCORING_CONFIG.forEach(pillar => {
    pillar.questions.forEach(q => {
        // This uses hardcoded wool questions!
    });
});
```

```javascript
// CORRECT
SCORING_CONFIG.forEach(pillar => {
    const questions = pillar.id === "pillar_1"
        ? getFilteredPillar1Questions(material)
        : pillar.questions;
    
    questions.forEach(q => {
        // Now uses material-specific questions
    });
});
```

---

### ❌ Not Syncing Material State

```javascript
// WRONG - material stays at default "Wool"
const [material, setMaterial] = useState("Wool");
// formData.composition changes but material doesn't update
```

```javascript
// CORRECT - sync material with composition
useEffect(() => {
    if (formData.composition && formData.composition !== material) {
        setMaterial(formData.composition);
    }
}, [formData.composition]);
```

---

### ❌ Using useCallback in Server Components

```javascript
// WRONG - causes "useCallback is not available in server Components" error
export const action = async () => {
    const myFunc = useCallback(() => {}, []);  // ❌
};
```

```javascript
// CORRECT - use regular functions
export const action = async () => {
    function myFunc() {}  // ✅
};
```

---

## Environment Setup

### Required Secrets

```bash
wrangler secret put SHOPIFY_API_SECRET
wrangler secret put MOCK_MODE  # Optional, set to "true" for testing
```

### Database Setup

```bash
# Create database
wrangler d1 create kadwood-db

# Run schema
wrangler d1 execute DB --remote --file=./app/db/schema.sql

# Seed data (if needed)
wrangler d1 execute DB --remote --file=./app/db/seed.sql
```

---

## Testing Checklist

When making changes, verify:

- [ ] Form displays correct questions for each material
- [ ] Scores calculate correctly (check browser console)
- [ ] Answers save to database (check with wrangler d1 execute)
- [ ] PDF displays material-specific certifications
- [ ] Collections load when mill auto-populated
- [ ] Distance calculations work for all materials
- [ ] Navigation to PDF preview works
- [ ] No console errors in browser
- [ ] No errors in wrangler tail logs

---

## Useful Commands

```bash
# Deploy
npm run deploy

# View logs
wrangler tail --format pretty

# Query database
wrangler d1 execute DB --remote --command "SELECT * FROM reports LIMIT 10"

# Check specific report
wrangler d1 execute DB --remote --command \
  "SELECT * FROM report_answers WHERE report_id = 'UUID'"

# Development
npm run dev
```

---

## Key Files Reference

| File | Purpose | Key Exports |
|------|---------|-------------|
| `app/config/scoring.js` | Question definitions | `SCORING_CONFIG`, `MATERIAL_CERTIFICATIONS` |
| `app/components/TransparencyWizard.jsx` | Form component | `TransparencyWizard` |
| `app/components/TransparencyPassportHTML.jsx` | PDF component | `TransparencyPassportHTML` |
| `app/routes/app.create-report.jsx` | Create report route | `loader`, `action` |
| `app/routes/app.passport.$id.jsx` | View report route | `loader` |
| `app/db/schema.sql` | Database schema | N/A |

---

## Quick Reference: Material Certifications

```javascript
// Wool
p1_woolmark, p1_rws

// Silk
p1_gots_silk, p1_oeko_silk

// Cotton
p1_gots_cotton, p1_bci

// Linen
p1_european_flax, p1_oeko_linen

// Cashmere
p1_sfa, p1_oeko_cashmere

// Mohair
p1_rms, p1_oeko_mohair

// Vicuna
p1_vicuna_permit, p1_oeko_vicuna

// Universal (all materials)
p1_chemistry, p1_rsl, p1_trims
```

---

## Architecture Diagram

```
┌─────────────┐
│   Shopify   │
│   Orders    │
└──────┬──────┘
       │
       ↓
┌──────────────────────────────┐
│  Remix App (Workers)         │
│  ┌────────────────────────┐  │
│  │ TransparencyWizard     │  │
│  │ - Dynamic questions    │  │
│  │ - Score calculation    │  │
│  │ - Emissions calc       │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ Action Handler         │  │
│  │ - Save to D1           │  │
│  │ - Material-specific    │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ TransparencyPassport   │  │
│  │ - PDF generation       │  │
│  │ - Material display     │  │
│  └────────────────────────┘  │
└───┬──────────────┬──────────┘
    │              │
    ↓              ↓
┌─────────┐  ┌──────────┐
│ D1 (DB) │  │ R2 (PDF) │
└─────────┘  └──────────┘
```

---

## Support

For detailed documentation, see:
- [`README.md`](./README.md) - Full project documentation
- [`DATABASE.md`](./DATABASE.md) - Database schema
- [`pillar1_audit.md`](./pillar1_audit.md) - Pillar 1 audit report

---

**Last Updated:** 2025-12-29
