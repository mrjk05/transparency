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

/** Merge the framing policy into a header bag for a raw Response. The policy goes last: it is
 *  not something a caller should be able to weaken by accident. */
export function withSecurityHeaders(headers = {}) {
  return { ...headers, 'Content-Security-Policy': FRAME_ANCESTORS };
}

/**
 * Is this request a same-origin submission?
 *
 * Moving an action off GET stops an `<img>` triggering it; it does not stop a cross-origin
 * auto-submitting form, which reaches a POST endpoint just as easily. `SameSite=Lax` is no
 * help for an action that only *sets* an expiring cookie rather than reading one.
 *
 * Three signals, in descending order of reliability, and then a deliberate default:
 *
 *   `Sec-Fetch-Site` — the direct answer. `none` means a typed URL or a bookmark.
 *                      `same-site` is refused: correct today, since the only submitter
 *                      is this app's own form, but a "sign out of Transparency" control
 *                      placed on studio.kadwood.com would 403 here with no obvious cause.
 *   `Origin`         — sent on POST by every browser that matters.
 *   `Referer`        — the fallback for Safari, which only shipped `Sec-Fetch-*` in 16.4 and
 *                      has historically omitted `Origin` on same-origin form POSTs.
 *
 * If NONE of the three is present, allow it. Failing closed there sounds safer and is not:
 * the thing being defended is a forced sign-out, which is a nuisance, while the cost is a
 * Sign out button that silently 403s on somebody's browser and cannot be worked around. A
 * cross-origin form POST always carries at least one of these; a request carrying none of
 * them is not a browser doing CSRF.
 */
export function isSameOriginRequest(request) {
  const site = request.headers.get('Sec-Fetch-Site');
  if (site) return site === 'same-origin' || site === 'none';

  const expected = new URL(request.url).origin;

  for (const header of ['Origin', 'Referer']) {
    const value = request.headers.get(header);
    if (!value) continue;
    try {
      return new URL(value).origin === expected;
    } catch {
      return false;
    }
  }

  return true;
}
