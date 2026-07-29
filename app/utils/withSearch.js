/**
 * Carry the current page's query string onto an in-app link.
 *
 * Two separate things depend on those parameters surviving a navigation, and before this
 * helper existed four links dropped them:
 *
 *   * `id_token` is how an embedded request authenticates. A link without it lands on a 401.
 *   * `host` is how the root shell knows it is inside the Shopify admin iframe. A link
 *     without it renders the standalone Kadwood Studio chrome — maroon bar and all — nested
 *     inside Shopify's admin.
 *
 * Two of the offenders were Polaris `backAction.url` props, which render a plain `<a href>`
 * because no `linkComponent` is configured, so they are full document loads and root's
 * loader really does re-run with the stripped URL.
 *
 * Takes `search` as an argument rather than reading `window.location` so it can be called
 * during server rendering: pass `useLocation().search`, which is defined on both sides and
 * therefore cannot produce a hydration mismatch.
 */
export function withSearch(path, search) {
  if (!search || search === '?') return path;

  const [base, own = ''] = path.split('?');
  const params = new URLSearchParams(search);

  // The link's own parameters win — `orderId` on a link must not be overwritten by the
  // `orderId` of the page it was clicked from.
  for (const [key, value] of new URLSearchParams(own)) {
    params.set(key, value);
  }

  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
