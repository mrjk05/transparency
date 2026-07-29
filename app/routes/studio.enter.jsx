/**
 * `GET /studio/enter?ticket=<opaque>&next=<path>` — the door from Kadwood Studio.
 *
 * Studio mints a short-lived, single-use ticket into the shared KV namespace
 * (`studio_ticket:<opaque>` -> the stylist's JWT) and links here. We redeem it, verify the
 * token behind it, and exchange it for an HttpOnly cookie.
 *
 * The ticket exists because the obvious design — `?token=<jwt>` — puts the wrong thing in a
 * URL. That JWT is not a hand-off credential; it is Studio's live API bearer, accepted by
 * kadwood-ai-backend for seven days. This Worker logs at `head_sampling_rate = 1` with
 * `persist = true`, so every sign-in URL is retained, and anyone who can read those logs
 * would get full Studio API access to every client record — not merely passport access.
 * An opaque ticket that dies on first use and expires in a minute is worth far less.
 */

import { redirect } from '@remix-run/cloudflare';
import {
  redeemTicket,
  verifyStudioJWT,
  isTokenRevoked,
  serializeStudioCookie,
} from '../auth/studioSession.server';
import { withSecurityHeaders } from '../utils/responseHeaders';

const DEFAULT_DESTINATION = '/app';
const ORIGIN_PROBE = 'https://transparency.invalid';

export const loader = async ({ request, context }) => {
  const { env } = context.cloudflare;
  const url = new URL(request.url);

  const token = await redeemTicket(url.searchParams.get('ticket'), env.TOKEN_BLACKLIST);
  if (!token) {
    // One message for malformed, unknown and already-spent. The differences are useful only
    // to someone probing the endpoint.
    return denied('That sign-in link is invalid, expired, or has already been used.');
  }

  // Signature before revocation — see the note on `isTokenRevoked`. The ticket only proves
  // Studio issued it, not that the session behind it is still good.
  const payload = await verifyStudioJWT(token, env.JWT_SECRET);
  if (!payload || (await isTokenRevoked(token, env.TOKEN_BLACKLIST))) {
    return denied('That Studio session is no longer valid. Sign in to Studio again.');
  }

  // Tie the cookie's lifetime to the token's own expiry rather than a fixed window, so the
  // two cannot disagree. A JWT that expires in ten minutes gets a ten-minute cookie.
  const maxAge = payload.exp - Math.floor(Date.now() / 1000);
  if (maxAge <= 0) {
    return denied('That Studio session has expired.');
  }

  return redirect(safeDestination(url.searchParams.get('next')), {
    headers: {
      'Set-Cookie': serializeStudioCookie(token, maxAge),
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
};

/**
 * Constrain `next` to a path on this origin.
 *
 * Without this the endpoint is an open redirect that also happens to hand out a session
 * cookie first — a phisher could land a freshly signed-in stylist on their page.
 *
 * The control-character strip is the part that is easy to get wrong, and an earlier revision
 * of this function did. The WHATWG URL parser removes U+0009, U+000A and U+000D from a URL
 * *before* parsing it, so `/<TAB>/evil.example` — which starts with a single slash, is not
 * `//` and is not `/\` — becomes protocol-relative `//evil.example` in the browser after
 * every prefix check has passed. Verified against workerd, which forwards a raw HTAB in a
 * `Location` header quite happily. CR and LF are stripped for a second reason: workerd
 * rejects them outright, turning what should be a 401 page into a 500 from inside the loader.
 *
 * Resolving against a throwaway origin is not sufficient either, and the revision that only
 * did that was worse than doing nothing. WHATWG path normalisation can *manufacture* a
 * leading `//` from input that had none: `/..//evil.example` normalises to the segments
 * `['', 'evil.example']`, which serialise as `//evil.example`. The origin of the resolved URL
 * is still this one — the origin check passes — but the string returned into a `Location`
 * header is protocol-relative, and the browser resolves it off-site. Returning `next`
 * untouched, as the first version did, was accidentally safe against this.
 *
 * So the guard is applied to the OUTPUT, not the input. That is the value that ends up in
 * the header, and it is the only value worth checking.
 */
export function safeDestination(next) {
  if (typeof next !== 'string' || next === '') return DEFAULT_DESTINATION;

  // eslint-disable-next-line no-control-regex
  const cleaned = next.replace(/[\u0000-\u001F\u007F\u2028\u2029\uFEFF]/g, '');

  if (!cleaned.startsWith('/') || cleaned.startsWith('//') || cleaned.startsWith('/\\')) {
    return DEFAULT_DESTINATION;
  }

  try {
    const resolved = new URL(cleaned, ORIGIN_PROBE);
    if (resolved.origin !== ORIGIN_PROBE) return DEFAULT_DESTINATION;

    // A Studio hand-off has no business carrying Shopify's embedded parameters. Left in,
    // `?shop=x` would ride `withSearch` onto every subsequent in-app link and lock the
    // session out of the Studio branch of `resolveAuth` for the rest of the visit — a
    // poisoned link that looks to the stylist like their session broke.
    const search = new URLSearchParams(resolved.search);
    for (const param of ['host', 'embedded', 'shop', 'id_token']) search.delete(param);
    const query = search.toString();

    const dest = `${resolved.pathname}${query ? `?${query}` : ''}${resolved.hash}`;

    // The check that matters, on the value actually emitted.
    if (!dest.startsWith('/') || dest.startsWith('//') || dest.startsWith('/\\')) {
      return DEFAULT_DESTINATION;
    }

    return dest;
  } catch {
    return DEFAULT_DESTINATION;
  }
}

function denied(message) {
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign-in failed — Kadwood Transparency</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           display: flex; align-items: center; justify-content: center; height: 100vh;
           margin: 0; background: #f6f6f7; color: #202223; }
    .card { background: #fff; padding: 48px 40px; border-radius: 8px; max-width: 420px;
            text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,.1); }
    h1 { margin: 0 0 12px; font-size: 20px; }
    p { margin: 0; color: #6d7175; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Sign-in failed</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`,
    {
      status: 401,
      headers: withSecurityHeaders({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      }),
    }
  );
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
