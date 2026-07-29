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
 * Note what that means: through Studio, every stylist reads Shopify with the SAME app-level
 * grant, so Shopify's per-user permissions no longer apply. That is acceptable only because
 * Studio does its own authentication first and every Studio account is already a Kadwood
 * stylist. It would not be acceptable as a general pattern, and it is the reason
 * `resolveAuth` is the only thing allowed to decide which branch runs.
 */

import { AUTH_SHOPIFY } from './resolveAuth.server';

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

  return env.SHOPIFY_ADMIN_TOKEN || null;
}
