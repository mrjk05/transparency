/**
 * The single authentication seam for the transparency app.
 *
 * This app now has three kinds of caller and exactly one place that decides who they are:
 *
 *   shopify — a stylist inside the Shopify admin iframe, identified by the `id_token` query
 *             parameter Shopify appends to every embedded request.
 *   studio  — a stylist inside Kadwood Studio, identified by the session cookie planted by
 *             `/studio/enter`.
 *   machine — Studio's *backend* calling the report API, identified by a shared secret.
 *
 * Everything downstream — loaders, actions, the API — asks this one function and gets back
 * the same shape regardless of which door was used. That is the whole point: the alternative
 * is each route growing its own notion of "authenticated", which is how the two entry points
 * start writing subtly different passports depending on where the stylist came from.
 *
 * Every result carries a `shop`. Shopify order and customer IDs are only unique WITHIN a
 * store, and this database is reachable from the production store and the dev store, so a
 * query that is not shop-scoped can match a dev report against a production customer. No
 * caller should ever have to remember to add the scope — it arrives with the identity.
 */

import { verifySessionToken } from './verifySessionToken.server';
import { readStudioCookie, verifyStudioJWT, isTokenRevoked } from './studioSession.server';

export const AUTH_SHOPIFY = 'shopify';
export const AUTH_STUDIO = 'studio';
export const AUTH_MACHINE = 'machine';

/** Header the Studio backend authenticates with. Must match Studio's TRANSPARENCY_ADMIN_SECRET. */
export const ADMIN_SECRET_HEADER = 'x-kadwood-admin-secret';

export const CANONICAL_SHOP = 'kadwood.myshopify.com';

/**
 * `limitedcollective` is not a second store — it is this store under the handle it traded
 * under before the rename, and Shopify keeps old `.myshopify.com` handles resolving forever.
 * Left unmapped, the same commission could be filed under two different `shop_domain` values
 * depending on which handle the admin session happened to report, and a customer's passports
 * would split into two lists neither of which is complete.
 */
const SHOP_ALIASES = {
  'limitedcollective.myshopify.com': CANONICAL_SHOP,
};

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/**
 * Shops the machine provider may name.
 *
 * An allowlist rather than "any well-formed myshopify.com host", because `shopDomain` is a
 * caller-supplied query parameter and `auth.shop` is interpolated straight into
 * `https://${auth.shop}/admin/api/...` alongside the app's offline Admin token. Accepting an
 * arbitrary shop turns the machine endpoint into a way to post that token to a host the
 * caller chose. `getAdminAccessToken` refuses non-canonical shops as well — two independent
 * guards, because this is the one place a leaked shared secret would otherwise cost far more
 * than passport data.
 */
const MACHINE_SHOPS = new Set([CANONICAL_SHOP, 'kaddev1.myshopify.com']);

/**
 * Query parameters Shopify puts on an embedded request. Their presence means the browser is
 * inside the Shopify admin, whatever else it may be carrying.
 */
const SHOPIFY_CONTEXT_PARAMS = ['host', 'embedded', 'shop', 'id_token'];

/**
 * Resolve the caller's identity.
 *
 * @param {Request} request
 * @param {Record<string, unknown>} env  Worker bindings and vars.
 * @param {{ allow?: string[] }} [options]
 *   `allow` restricts which providers this route accepts. Defaults to the two human
 *   providers — a route must opt IN to machine access rather than out of it, so adding a
 *   page never silently exposes it to anything holding the admin secret.
 * @returns {Promise<{ok: true, mode: string, shop: string, userId: string, email: string|null}
 *                 | {ok: false, status: number, reason: string}>}
 */
export async function resolveAuth(request, env, options = {}) {
  const allow = options.allow ?? [AUTH_SHOPIFY, AUTH_STUDIO];
  const params = new URL(request.url).searchParams;

  if (allow.includes(AUTH_MACHINE)) {
    const presented = request.headers.get(ADMIN_SECRET_HEADER);
    if (presented !== null) {
      // Once the header is present this is a machine attempt and nothing else. Falling
      // through to the human providers on a bad secret would let an attacker probe the
      // secret and then quietly get in some other way, muddying both the audit trail and
      // the response we return.
      if (!(await secretsMatch(presented, env.STUDIO_ADMIN_SECRET))) {
        return fail(401, 'invalid admin secret');
      }

      const shop = canonicalShop(params.get('shopDomain'));
      if (!shop || !MACHINE_SHOPS.has(shop)) {
        return fail(400, 'shopDomain is required and must name a known Kadwood store');
      }

      return { ok: true, mode: AUTH_MACHINE, shop, userId: 'studio-backend', email: null };
    }
  }

  if (allow.includes(AUTH_SHOPIFY) && params.has('id_token')) {
    const auth = await verifySessionToken(request, env.SHOPIFY_API_SECRET);
    if (!auth.ok) {
      return fail(401, auth.reason || 'invalid session token');
    }

    const shop = canonicalShop(auth.shop);
    if (!shop) {
      return fail(401, 'session token names an unrecognised shop');
    }

    return { ok: true, mode: AUTH_SHOPIFY, shop, userId: String(auth.userId ?? ''), email: null };
  }

  // A Studio cookie must never rescue a request that came from the Shopify admin.
  //
  // Without this guard, an embedded request whose `id_token` went stale or was dropped by an
  // in-app link falls through to the Studio branch, which hard-codes the canonical shop and
  // then draws on the app-level offline Admin token. A stylist with a Studio cookie opening
  // the app in the DEV store would be shown production orders on a dev-store screen, and
  // could file a passport against a production order from that session. It would also mean
  // Shopify's per-staff permissions stop applying to embedded traffic the moment a token
  // expires — silently, and only for the people who happen to hold a Studio cookie.
  const inShopifyContext = SHOPIFY_CONTEXT_PARAMS.some((p) => params.has(p));

  if (allow.includes(AUTH_STUDIO) && !inShopifyContext) {
    const token = readStudioCookie(request);
    if (token) {
      // Signature FIRST, revocation second. The blacklist key is the token string, and that
      // namespace is shared with Studio, where it also holds live `otp:<email>` login codes.
      // Reading it with an unverified string makes this an existence oracle for those keys.
      // See the note on `isTokenRevoked`.
      const payload = await verifyStudioJWT(token, env.JWT_SECRET);

      // One reason string for both outcomes. Distinguishing "revoked" from "invalid" tells a
      // prober which of the two they hit, and there is no caller who can act on the
      // difference.
      if (!payload || (await isTokenRevoked(token, env.TOKEN_BLACKLIST))) {
        return fail(401, 'invalid or expired studio session');
      }

      // The Studio JWT says who the stylist is, not which store they are looking at —
      // Studio has no concept of a shop. The canonical store is the only answer.
      return {
        ok: true,
        mode: AUTH_STUDIO,
        shop: CANONICAL_SHOP,
        userId: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : null,
      };
    }
  }

  return fail(401, 'no credentials presented');
}

/**
 * Normalise a shop domain, or return null if it is not one.
 *
 * Accepts what Shopify actually hands us — `https://shop.myshopify.com`, with or without an
 * `/admin` suffix or trailing slash — because `verifySessionToken` derives `shop` from the
 * token's `dest` claim by string surgery and its output is not guaranteed to be bare.
 */
export function canonicalShop(value) {
  if (typeof value !== 'string') return null;

  let shop = value.trim().toLowerCase();
  if (shop === '') return null;

  shop = shop.replace(/^https?:\/\//, '');
  shop = shop.replace(/\/admin\/?$/, '').replace(/\/+$/, '');

  if (!SHOP_DOMAIN_RE.test(shop)) return null;

  return SHOP_ALIASES[shop] ?? shop;
}

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * Digest first, then compare the digests. A naive byte loop over the raw strings returns
 * early on a length mismatch and so leaks the secret's length; SHA-256 makes both operands
 * exactly 32 bytes whatever went in.
 */
async function secretsMatch(presented, expected) {
  if (typeof presented !== 'string' || typeof expected !== 'string') return false;
  // An unset STUDIO_ADMIN_SECRET must not be matchable by an empty header.
  if (presented === '' || expected === '') return false;

  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(presented)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);

  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

function fail(status, reason) {
  return { ok: false, status, reason };
}
