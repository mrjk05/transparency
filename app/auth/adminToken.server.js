/**
 * Getting an Admin API access token, whichever door the caller came through.
 *
 * In the Shopify admin the app has no standing credential — it exchanges the request's
 * `id_token` for a short-lived online access token scoped to the stylist who is looking at
 * the screen. That is the right thing there and it is why the existing code does it.
 *
 * It is also impossible anywhere else. A Studio session has no `id_token` to exchange, so
 * the same page rendered through Studio would show an empty order list. The fallback is the
 * app's own offline token (`SHOPIFY_ADMIN_TOKEN`).
 *
 * Be clear-eyed about what that costs. Through Studio, every stylist reads Shopify with the
 * SAME app-level grant, so Shopify's per-user permissions stop applying. And that grant is
 * not read-only: `wrangler.toml` declares `write_customers` and `write_orders` alongside the
 * reads, so an offline token minted with the app's scopes can change customer and order
 * records, not merely list them.
 *
 * What bounds it is weaker than "every Studio account is a Kadwood stylist". Studio's gate is
 * an email-domain check with auto-provisioning on first OTP request — no allowlist, no role,
 * no approval — so anyone who can receive mail at a `@kadwood.com` address, including a
 * former employee whose alias still routes, obtains a Studio account and with it this grant.
 * Narrowing `SHOPIFY_ADMIN_TOKEN` to a read-only scope set is the right follow-up; it is
 * recorded in the plan's open risks.
 */

import { AUTH_SHOPIFY, CANONICAL_SHOP } from './resolveAuth.server';

/**
 * @returns {Promise<string|null>} An Admin API access token, or null if none can be obtained.
 */
export async function getAdminAccessToken(request, env, auth) {
  if (auth.mode === AUTH_SHOPIFY) {
    const sessionToken = new URL(request.url).searchParams.get('id_token');
    if (!sessionToken) return null;

    try {
      const response = await fetch(`https://${auth.shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: env.SHOPIFY_API_KEY,
          client_secret: env.SHOPIFY_API_SECRET,
          grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
          subject_token: sessionToken,
          subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
          requested_token_type: 'urn:shopify:params:oauth:token-type:online-access-token',
        }),
      });

      if (!response.ok) {
        console.error('[adminToken] Token exchange failed:', response.status, await response.text());
        return null;
      }

      const data = await response.json();
      return data.access_token ?? null;
    } catch (error) {
      console.error('[adminToken] Token exchange threw:', error);
      return null;
    }
  }

  // The offline token belongs to ONE store. Callers reach here with `auth.shop`, and every
  // call site interpolates that straight into `https://${auth.shop}/admin/api/...` with this
  // token in an `X-Shopify-Access-Token` header. Releasing it for any other shop would post
  // a long-lived, write-capable credential to a host the caller named — and in machine mode
  // that host arrives as a query parameter. `resolveAuth` already allowlists those; this is
  // the second, independent guard, so neither one alone has to be right.
  if (auth.shop !== CANONICAL_SHOP) {
    console.error(`[adminToken] refusing to release the offline token for shop "${auth.shop}"`);
    return null;
  }

  return env.SHOPIFY_ADMIN_TOKEN || null;
}
