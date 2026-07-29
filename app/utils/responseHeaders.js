/**
 * Security headers for routes that return a raw `Response`.
 *
 * `entry.server.jsx` sets these for document renders, but a Remix *resource* route — a
 * loader that returns a `Response` and exports no component — never goes through
 * `handleRequest`, so it shipped no CSP at all. That covers `/`, `/studio/enter`'s failure
 * page and `/studio/signed-out`: the two pages an attacker would most want to frame, because
 * "sign-in failed" and "signed out" are exactly the context for a credential-reprompt
 * overlay.
 */

/** Framing policy. `self` covers the standalone Studio pages; the two Shopify origins cover
 *  the embedded admin. Getting this list wrong renders the embedded app as a blank frame, so
 *  it is defined once here and in `entry.server.jsx` only. */
export const FRAME_ANCESTORS =
  "frame-ancestors 'self' https://admin.shopify.com https://*.myshopify.com";

/** Merge the framing policy into a header bag for a raw Response. */
export function withSecurityHeaders(headers = {}) {
  return { 'Content-Security-Policy': FRAME_ANCESTORS, ...headers };
}

/**
 * Is this request a same-origin submission?
 *
 * Moving an action off GET stops an `<img>` triggering it; it does not stop a cross-origin
 * auto-submitting form, which reaches a POST endpoint just as easily. `SameSite=Lax` is no
 * help for an action that only *sets* an expiring cookie rather than reading one.
 *
 * `Sec-Fetch-Site` is the direct answer where it exists (`none` is a user-typed URL or
 * bookmark). The `Origin` fallback covers browsers that do not send it.
 */
export function isSameOriginRequest(request) {
  const site = request.headers.get('Sec-Fetch-Site');
  if (site) return site === 'same-origin' || site === 'none';

  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
