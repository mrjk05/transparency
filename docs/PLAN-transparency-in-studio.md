# Plan — Transparency Passport in Kadwood Studio

**Status:** approved, not yet built
**Date:** 2026-07-28
**Repos touched:** `mrjk05/transparency`, `mrjk05/kadwood-ai`

---

## 1. Goal

Make the Transparency Passport reachable from Kadwood Studio as a bolt-on tool, in the same
shape as the Size You add-on:

- launched from **Tools** at `transparency.kadwood.com` with a `?token=` SSO handoff,
- passports visible **on the client** in Studio,
- passports pushable to the client's **members portal** through the existing Files Worker.

Mostly reuse. One genuine build sits in the middle of it: the passport has never actually
been rendered to a PDF.

---

## 2. Starting state (verified against prod, 2026-07-28)

| Fact | Evidence |
|---|---|
| **No PDF is ever produced server-side.** Generation and R2 upload are commented out; rows save with `pdf_r2_key = "N/A"`. The only real PDF is built in the browser by `PDFDownloadLink`. | `app/routes/app.create-report.jsx:419-423`, `app/components/DownloadPDFButton.jsx` |
| **Auth is Shopify-embedded only.** Loaders read `id_token` off the query string; there is no JWT path. | `app/auth/verifySessionToken.server.js`, `app.create-report.jsx:90` |
| **Reports key on the order *name*** (`#K-1116`), not a stable ID. `shopify_customer_id` exists but is never written. | `app/db/schema.sql:42-49`, `app.create-report.jsx:428-457` |
| **No upsert.** Every submit INSERTs; reads take `ORDER BY created_at DESC LIMIT 1`. | `app.create-report.jsx:451`, `:337` |
| **18 report rows / 4 real orders.** `#K-1116` has 7 copies. 3 rows have `shopify_order_id = "UNKNOWN"`. `shopify_customer_id` NULL on all 18. `suit_id = "KAD-UNKNOWN"` on all 18. Nothing created since 2026-01-15. | `kadwood-db` |
| **9 suppliers / 129 fabric collections**, of which `app/db/seed.sql` accounts for only a fraction (1 `suppliers` insert, 7 `fabric_collections`) — the rest arrived out of band. **No management UI exists** for either. | `kadwood-db`, `app/db/seed.sql` |
| **290 `report_answers`** across the 18 reports (8–19 each). None are seeded — every row is stylist-entered audit data, and it is what the passport's second page is rendered from. | `kadwood-db` |
| **`kadwood-db` has no users or teams table.** Transparency cannot authorise "who may act on which client". | `sqlite_master` |
| **Three divergent renderers** for the same document. | `TransparencyPassportHTML.jsx`, `TransparencyPassportPDF.jsx`, `app.create-report.jsx:26-66` |

Studio side:

| Fact | Evidence |
|---|---|
| Studio has **no orders table** — orders are fetched live per client. | `backend/src/workers/api/shopifySync.ts:311` |
| Studio pushes files to the portal by reading R2 and POSTing multipart to the Files Worker. | `backend/src/workers/api/sendToFiles.ts` |
| Files Worker has **no update endpoint** (POST/GET/DELETE only), sends **no email** on upload, and gives every PDF the same placeholder thumbnail `previews/PDFKADWOOD.png`. | `files/apps/worker/src/index.ts:297-340` |
| Studio JWTs last **7 days** and are revoked via `TOKEN_BLACKLIST` KV, checked per request. Size You does **not** check that blacklist. | `kadwood_ai/backend/src/lib/auth.ts:16`, `middleware/auth.ts:15` |
| Studio is single-team today (1 team, 2 users, 68 clients) but the model is multi-team. | `kadwood-ai-db` |

---

## 3. Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| 1 | Hosting / auth | Add a Studio-JWT path to the existing Remix worker; standalone subdomain | Size You pattern; keeps the wizard and scoring intact. A full port to Next.js is 3–5× the work for an aesthetic win |
| 2 | Anchor | Order-anchored | Fabric metafields live on the order, so one order carries one fabric story |
| 3 | Scope of a passport | The specific suit **order**, not a line item | Order-level metafields already encode this |
| 4 | Identity | Numeric Shopify order ID is the key; order name is display | Names are per-store, mutable, and already produced `"UNKNOWN"` three times |
| 5 | PDF | Browser Rendering (`@cloudflare/puppeteer`) on `TransparencyPassportHTML` → PDF → `kadwood-reports`, eager on save, overwrite in place. **No PNG** | Proven in `size_you_generator/backend/src/render.ts`. Collapses three renderers to one. `@react-pdf/renderer` on workerd was already abandoned once |
| 6 | Client → reports | Denormalise `shopify_customer_id` onto the report | Column already exists; Studio already caches `clients.shopify_customer_id`. One indexed query, no Shopify roundtrip |
| 7 | Worker ↔ worker | HTTP contract with a shared secret; bucket stays private | Separate repos with separate deploys — direct table reads would break Studio from a change landed in another repo, in prod, with no test to catch it |
| 8 | Studio UI | No new tab — passports render inline on the client's **Orders** list | The passport is an attribute of the order; a separate tab is a filtered duplicate of the order list |
| 9 | Portal state | New Studio table `client_passport_uploads`; Studio proxies bytes and owns the state | Whoever owns the integration owns the state. Studio holds the Files secret and enforces team ownership |
| 10 | Entry points | **Both** embedded and standalone survive | Owner's call |
| 11 | Divergence | Fork at exactly two seams — `resolveAuth()` and the root shell. One route tree | Duplicating the *action* (D1 + R2 writes) is how passports start differing by which door the stylist used |
| 12 | Tools entry | Order picker + passport back-office list. Supplier/collection management deferred | First two are near-free; the third is the only genuinely new UI |
| 13 | Tenancy | Add `shop_domain`. **No `team_id`** | D1 cannot alter a UNIQUE constraint in place — cheap now, table rebuild later. `team_id` would be written but never checked, which reads like a security control and isn't one |
| 14 | Edit after push | Stale indicator + manual re-push | The passport is a customer-facing claim; auto-push would ship a document per keystroke-save and destroy the customer's link each time |
| 15 | `suit_id` | = the order name | The customer recognises `#K-1116` |
| 16 | Which orders | No gate — every order can carry a passport | Owner's call. Consequence logged in §7 |
| 17 | **One suit, several orders** | `report_orders` join table | Confirmed: Kadwood bills deposit + final payment as two orders. 1:1 on the order would duplicate or misattach |
| 18 | Session | `?token=` → HttpOnly cookie at `/studio/enter`, cookie thereafter | Remix loaders are server-side; `localStorage` (the Size You approach) never reaches them, so page two would be unauthenticated |
| 19 | Revocation | Bind `TOKEN_BLACKLIST` KV, check per request; cookie carries the JWT | One binding, one `await`; makes a 7-day cookie safe |
| 20 | Sequencing | Vertical tracer bullet, preceded by a render spike | The risk is at the seams, not inside any layer |

---

## 4. Schema

### `kadwood-db` (transparency)

```sql
ALTER TABLE reports ADD COLUMN shop_domain TEXT;
ALTER TABLE reports ADD COLUMN shopify_order_numeric_id TEXT;  -- primary order, display hint
ALTER TABLE reports ADD COLUMN rendered_at INTEGER;            -- drives the stale check

CREATE TABLE report_orders (
  report_id        TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  shop_domain      TEXT NOT NULL,
  order_numeric_id TEXT NOT NULL,
  order_name       TEXT,
  is_primary       INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  UNIQUE (shop_domain, order_numeric_id)
);

CREATE INDEX idx_reports_customer ON reports(shop_domain, shopify_customer_id);
CREATE INDEX idx_report_orders_report ON report_orders(report_id);
-- At most one order names each passport (not "exactly one" — zero primaries is permitted).
CREATE UNIQUE INDEX idx_report_orders_one_primary ON report_orders(report_id) WHERE is_primary = 1;
```

`ON DELETE CASCADE` is load-bearing: migration 002 deletes reports, and one already attached to
an order would otherwise abort that DELETE on a foreign key — after the answer deletion ahead of
it had committed, stripping a surviving passport of the evidence its second page renders from.

**Canonical `shop_domain`: `kadwood.myshopify.com`.** The store is also reachable as
`limitedcollective.myshopify.com` (its former handle). Every shop-scoped query — the two
endpoints in §5, `idx_reports_customer`, and Studio's `env.SHOPIFY_STORE_DOMAIN` — must use the
same spelling or they silently return nothing. `sessions` is empty in production, so there is no
in-database precedent to infer it from; this line is the pin.

`report_orders` is the truth: an order belongs to at most one passport, a passport may span
several. `reports.shopify_order_numeric_id` is a display hint only.

Start writing the columns that already exist and are dead: `shopify_customer_id`,
`pdf_r2_key`, `suit_id`.

**Migration of existing data:** keep the newest row per order (4 survive); delete the 11
duplicates, the 3 `UNKNOWN` rows, and their `report_answers`. A one-off script resolves the
4 order names to numeric IDs via the Shopify Admin API and seeds `report_orders`.

### `kadwood-ai-db` (Studio)

```sql
CREATE TABLE client_passport_uploads (
  report_id          TEXT PRIMARY KEY,
  client_id          TEXT NOT NULL REFERENCES clients(id),
  files_asset_id     TEXT,
  files_customer_id  TEXT,
  files_uploaded_at  INTEGER,
  report_rendered_at INTEGER   -- rendered_at at push time; compare to detect staleness
);
```

---

## 5. Interfaces

### Transparency — machine (`x-kadwood-admin-secret`: `STUDIO_ADMIN_SECRET`)

- `GET /api/studio/reports?customerId=&shopDomain=` → passports for a customer, with score,
  primary order, `rendered_at`, and attached order IDs
- `GET /api/studio/reports/:id/pdf?shopDomain=` → PDF bytes

Deliberately **two** endpoints, not three. Studio picks a single passport out of the shop-scoped
list rather than fetching it by ID, so every path that moves customer-facing bytes is scoped by
shop. Order and customer IDs are only unique within a store and this database is reachable from
the dev store, so an unscoped by-ID lookup could match a dev report against a production
customer ID and deliver its PDF to a real customer.

### Transparency — human (Studio JWT cookie)

- `GET /studio/enter?token=<jwt>` → verify, set HttpOnly cookie, redirect to a clean URL
- `/studio/*` → order picker, wizard, passport list

### Studio

- `GET /api/clients/:id/passports` → proxy transparency, merge upload state, flag stale
- `POST /api/clients/:id/passports/:reportId/portal` → fetch PDF, push to Files, record
- `DELETE /api/clients/:id/passports/:reportId/portal` → remove from Files, clear state

Portal metadata:

| Field | Value |
|---|---|
| `filename` | `Kadwood Transparency Passport - K-1116.pdf` |
| `title` | `Transparency Passport — Order #K-1116` |
| `description` | `Sustainability score 88/100 · 100% Wool · Vitale Barberis Canonico` |

The description carries weight: every PDF in the portal shares one placeholder thumbnail, so
it is the only thing distinguishing a passport from any other document.

### Config

**Transparency** — bindings: `[browser]`, `TOKEN_BLACKLIST` KV. Secrets: `JWT_SECRET`
(must equal `kadwood-ai-backend`'s), `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_STORE_DOMAIN`,
`STUDIO_ADMIN_SECRET`, `COOKIE_SECRET`. Custom domain `transparency.kadwood.com`.

**Studio** — vars `TRANSPARENCY_URL`, `TRANSPARENCY_ADMIN_SECRET`.

Cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, host-scoped to `transparency.kadwood.com`,
expiry matched to the JWT's own `exp`.

---

## 6. Build order

**Spike — done, 2026-07-28. Decision 5 stands.**

Rendered the real prod fixture (report `21194f9e…`, order `#K-1116`, score 88) through
Playwright's `chrome-headless-shell` — the same engine Cloudflare Browser Rendering runs.

Result: a clean **2-page A4 PDF**. Page 1 is the summary (logo, scorecard, total score,
supply-chain journey, disclaimer); page 2 is the per-pillar detail tables. The
`print-page-wrapper` / `print-border-container` strategy works — the brand border sits
correctly on both pages and `page-break-after: always` gives exactly two pages.

Three findings feed into T3:

1. **Fonts must be inlined, or every passport ships in Times New Roman.** Verified with
   `pdffonts`: the unmodified template embedded *only* `TimesNewRomanPSMT` /
   `-BoldMT` / `-ItalicMT`. The template asks for `'Helvetica Neue', Helvetica, Arial,
   sans-serif` and none of it resolved. Fix proven: `@font-face` with base64 data URIs, the
   `size_you_generator/scripts/gen-assets.mjs` pattern. After the fix the PDF embeds
   `HelveticaNeue-Light/Medium/Bold/LightItalic` as intended.
2. **Subset the fonts.** The full Helvetica Neue OTF set is 1337 KB (→ ~1.9 MB of render
   HTML). Subset to Latin-1 + Latin Extended-A + the handful of symbols used, in woff2:
   **100 KB**, embedding an identical set of faces. Command:
   `python3 -m fontTools.subset <f>.otf --unicodes=U+0020-007E,U+00A0-00FF,U+0100-017F,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+2192,U+00B2,U+2082,U+00B7,U+20AC --flavor=woff2`
   (Latin Extended-A is required — `Prostějov` appears in real supply-chain data.)
3. **Drop the Google Fonts `@import`** (`TransparencyPassportHTML.jsx:55`). It pulls Inter,
   which the template never uses, and Browser Rendering should not depend on a third-party
   fetch mid-render.

Minor, not blocking: `→` and `₂` are absent from Helvetica Neue and fall back to Arial —
invisible in practice. Long item names wrap and push the composition line out of alignment in
the 4-column info row (visible on the fixture: "The Australian Suit: 2 Piece Edition").

Open choice for T3: the template's own design intent is **Helvetica Neue** (sans) and that is
what will be implemented. **Cormorant Garamond** (already vendored, 90 KB unsubsetted) is the
serif used on the Size You card — a one-line swap if brand consistency across the two
documents matters more than the template's current look.

Then, one vertical slice per PR:

| PR | Repo | Contents |
|---|---|---|
| T1 | transparency | Schema migration, `report_orders`, dedupe + backfill script |
| T2 | transparency | `resolveAuth` (3 providers), `/studio/enter` cookie, `TOKEN_BLACKLIST`, root shell fork |
| T3 | transparency | PDF render → R2, report upsert, write the dead columns |
| T4 | transparency | Studio-facing HTTP API |
| K1 | kadwood-ai | `client_passport_uploads`, passports API, portal push/remove |
| K2 | kadwood-ai | Orders-row passport chip, Tools nav entry |

Phase two (not scheduled): supplier and fabric-collection management UI.

---

## 7. Open risks

1. **The spike gates decision 5.** If A4 output from the HTML template is poor, revisit
   before T1 lands.
2. **Which order is primary?** Depends on whether the deposit *and* balance orders both
   carry the `custom.fabric_*` metafields. Not answerable from code — check one real pair.
3. **Decision 16 weakens gap detection.** With no gate, alterations and accessories read as
   "missing a passport", so the Orders list stops being a reliable way to spot a real gap.
   Revisit once the real order mix is visible.
4. **Phase two matters more than its position suggests.** 129 collections with no management
   UI, and `findClosestCollection` (`app.create-report.jsx:230-252`) fails *silently* at a
   30% Levenshtein threshold — the likeliest reason a stylist abandons a passport mid-flow.
   Masked today only because four passports exist.
5. **API version drift.** Transparency uses GraphQL `2024-01`; Studio uses REST `2025-07`.
   Not blocking, worth aligning eventually.
6. **Separate follow-up, other repo:** Size You does not check `TOKEN_BLACKLIST` either — a
   token revoked in Studio keeps working there for up to 7 days. Same one-line fix. Issue on
   `size_you_generator`, not part of this work.
