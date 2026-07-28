#!/usr/bin/env node
/**
 * One-off backfill: resolve each surviving report's Shopify order NAME (e.g. "#K-1116") to a
 * stable numeric order ID, stamp the shop and customer onto `reports`, and seed `report_orders`.
 *
 * Reports have only ever stored the order *name*, which is a display string: per-store,
 * human-entered, and already responsible for three rows reading "UNKNOWN". Everything from
 * here on keys on the numeric ID (see migrations 001/002 and docs/PLAN-transparency-in-studio.md).
 *
 * This script does not touch the database. It prints SQL to stdout so the statements can be
 * read before they are run:
 *
 *   export SHOPIFY_STORE_DOMAIN=kadwood.myshopify.com   # canonical — see below
 *   export SHOPIFY_ADMIN_TOKEN=shpat_...                # needs read_all_orders
 *   node scripts/backfill-report-orders.mjs > backfill.sql || echo "REVIEW: unresolved reports"
 *   less backfill.sql
 *   npx wrangler d1 execute kadwood-db --file=backfill.sql
 *
 * Exits non-zero if any report could not be resolved. The redirection above still writes the
 * file, so check the exit status — `>` alone will not stop a pipeline.
 *
 * SHOPIFY_STORE_DOMAIN is stamped onto every row as `shop_domain` and becomes the value every
 * later shop-scoped query must match exactly, including Studio's. The store answers to both
 * `kadwood.myshopify.com` and `limitedcollective.myshopify.com` (its former handle);
 * **`kadwood.myshopify.com` is canonical** and is what Studio sends. Using the other spelling
 * makes those queries return nothing, silently.
 *
 * SHOPIFY_ADMIN_TOKEN must carry `read_all_orders`: the REST Order resource returns only the
 * last 60 days without it, and every report being backfilled is older than that.
 *
 * Run AFTER migrations 001 and 002. Safe to re-run: the emitted SQL is idempotent.
 */
import { execFileSync } from "node:child_process";

const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const API_VERSION = "2025-07";
const DB = process.env.D1_DATABASE || "kadwood-db";

if (!SHOP || !TOKEN) {
  console.error("Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN before running.");
  process.exit(1);
}

/**
 * Every character SQLite or a human reader would treat as ending a line, plus the remaining C0
 * controls so nothing invisible survives into a file someone is asked to review.
 *
 * Written as escapes and never as literals: U+2028 and U+2029 are line terminators in
 * JavaScript source too, so embedding them here would break this file.
 */
const stripControls = (s) => s.replace(/[\u0000-\u001F\u007F\u2028\u2029]+/g, " ");

/**
 * Quote a value for SQL.
 *
 * Doubling `'` is what makes a value safe to EXECUTE. Stripping controls first is what keeps it
 * safe to READ, and this script's entire safety argument is that it prints SQL for a human to
 * check before running it. A newline inside an order name splits the statement across physical
 * lines, one of which can be made to read `DELETE FROM reports;` — inert inside a string
 * literal, but indistinguishable from the real thing at a glance, and the sanitised comment
 * directly above it would then disagree with what the statement appears to say. A NUL is worse
 * than cosmetic: it truncates sqlite3's line buffer and desynchronises the parse outright.
 */
const sqlLiteral = (v) =>
  v === null || v === undefined ? "NULL" : `'${stripControls(String(v)).replace(/'/g, "''")}'`;

/**
 * Sanitise a value destined for a `--` comment line.
 *
 * A comment has no closing delimiter: a newline ends it and everything after becomes executable
 * SQL. `reports.shopify_order_id` is stylist-entered (TransparencyWizard writes
 * `formData.shopify_order_id`, only falling back to the real order name), so a crafted or
 * fat-fingered value could otherwise smuggle a statement into a file the operator is told to
 * pipe straight into `wrangler d1 execute` — and an injected DELETE buried in a wall of
 * comments is exactly what a human skim misses.
 */
const sqlComment = (v) => {
  const cleaned = stripControls(String(v ?? "")).trim();
  if (!cleaned) return "(blank)";
  // Say so when the tail is dropped, or the comment silently under-reports what the statement
  // beside it actually writes.
  return cleaned.length > 200 ? `${cleaned.slice(0, 200)} …(truncated)` : cleaned;
};

/** Read the surviving reports straight out of D1 via wrangler. */
function loadReports() {
  const out = execFileSync(
    "npx",
    [
      "wrangler", "d1", "execute", DB, "--remote", "--json",
      "--command", "SELECT id, shopify_order_id FROM reports ORDER BY created_at",
    ],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  // wrangler prints a JSON array of result envelopes.
  const parsed = JSON.parse(out);
  const results = Array.isArray(parsed) ? parsed[0]?.results : parsed?.results;
  if (!results) throw new Error("Could not read results from wrangler output");
  return results;
}

/**
 * Look an order up by its name.
 *
 * Returns the order, or null when Shopify genuinely has no such order. Throws on transport or
 * API failure — the caller must be able to tell "no such order" from "could not ask", because
 * the two demand opposite responses and both used to produce the same comment.
 *
 * `orders.json?name=` is an undocumented filter and matches loosely rather than exactly (a
 * request for `118665-1` can return `#118665-2`), so the name that comes back is verified
 * against the name we asked for. Getting this wrong would write the wrong numeric ID, the wrong
 * customer, and claim the wrong order in report_orders — corrupting the very identity this
 * backfill exists to establish.
 */
async function findOrder(name) {
  const url =
    `https://${SHOP}/admin/api/${API_VERSION}/orders.json` +
    `?status=any&limit=5&name=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    headers: { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Shopify ${res.status} for ${name}: ${(await res.text()).slice(0, 200)}`);
  }
  const { orders } = await res.json();
  const wanted = String(name).trim();
  const order = (orders ?? []).find((o) => String(o.name).trim() === wanted);
  if (!order) {
    const saw = (orders ?? []).map((o) => o.name).join(", ");
    if (saw) console.error(`  ! ${name}: no exact match (Shopify returned: ${saw})`);
    return null;
  }
  return { id: String(order.id), name: order.name, customerId: order.customer?.id ? String(order.customer.id) : null };
}

const reports = loadReports();
console.error(`Found ${reports.length} report(s) to backfill.`);

const lines = [
  "-- Generated by scripts/backfill-report-orders.mjs",
  `-- shop: ${sqlComment(SHOP)}   generated against ${reports.length} report(s)`,
  "",
];
let resolved = 0;
const notFound = [];
const failed = [];

for (const row of reports) {
  const name = row.shopify_order_id;
  let order = null;
  let transportError = null;
  try {
    order = await findOrder(name);
  } catch (err) {
    transportError = err;
    console.error(`  ! ${name}: ${err.message}`);
  }

  if (!order) {
    (transportError ? failed : notFound).push(name);
    const why = transportError ? "Shopify could not be queried" : "Shopify has no order with that exact name";
    lines.push(`-- UNRESOLVED: report ${sqlComment(row.id)} references order ${sqlComment(name)} — ${why}.`);
    lines.push(`--   Left untouched. Attach by hand once the correct order is identified.`);
    lines.push("");
    continue;
  }

  resolved += 1;
  console.error(`  ✓ ${name} -> order ${order.id}${order.customerId ? `, customer ${order.customerId}` : " (no customer)"}`);

  lines.push(`-- ${sqlComment(name)} -> ${sqlComment(order.id)}`);
  lines.push(
    `UPDATE reports SET shop_domain = ${sqlLiteral(SHOP)},` +
      ` shopify_order_numeric_id = ${sqlLiteral(order.id)},` +
      ` shopify_customer_id = COALESCE(shopify_customer_id, ${sqlLiteral(order.customerId)}),` +
      ` suit_id = ${sqlLiteral(order.name)}` +
      ` WHERE id = ${sqlLiteral(row.id)};`,
  );
  // Re-running the same mapping is a no-op; a DIFFERENT report claiming this order hits the
  // UNIQUE constraint and stops the run. `INSERT OR IGNORE` would have swallowed exactly the
  // conflict report_orders exists to catch — two passports over one order — and still reported
  // success.
  lines.push(
    `INSERT INTO report_orders (report_id, shop_domain, order_numeric_id, order_name, is_primary)` +
      ` SELECT ${sqlLiteral(row.id)}, ${sqlLiteral(SHOP)}, ${sqlLiteral(order.id)}, ${sqlLiteral(order.name)}, 1` +
      ` WHERE NOT EXISTS (SELECT 1 FROM report_orders WHERE report_id = ${sqlLiteral(row.id)}` +
      ` AND shop_domain = ${sqlLiteral(SHOP)} AND order_numeric_id = ${sqlLiteral(order.id)});`,
  );
  lines.push("");
}

lines.push(`-- resolved ${resolved}/${reports.length}; not found: ${notFound.length}; lookup failures: ${failed.length}`);
process.stdout.write(lines.join("\n") + "\n");

if (notFound.length) {
  console.error(`\n${notFound.length} order(s) not found in Shopify: ${notFound.join(", ")}`);
}
if (failed.length) {
  console.error(`\n${failed.length} lookup(s) FAILED — not the same as "not found": ${failed.join(", ")}`);
  console.error(
    'If every lookup failed, check that SHOPIFY_ADMIN_TOKEN carries read_all_orders. The REST\n' +
      'Order resource returns only the last 60 days without it, and every surviving report here\n' +
      'is older than that.',
  );
}
// Exit non-zero if anything is missing. `node scripts/... > backfill.sql` previously exited 0
// even when every lookup had failed, so the documented flow would apply a backfill that did
// nothing and say so only on stderr.
if (notFound.length || failed.length) {
  console.error("\nGenerated SQL covers only the resolved reports. Review before executing.");
  process.exit(1);
}
