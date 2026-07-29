/**
 * `GET /studio/enter?token=<jwt>&next=<path>` — the door from Kadwood Studio.
 *
 * Studio opens this URL with the stylist's existing JWT. We verify it once, exchange it for
 * an HttpOnly cookie, and bounce to a clean URL. From that point on the token is never in an
 * address bar, a browser history entry, or a `Referer` header again.
 *
 * The token IS in the URL for the length of this one request, which is unavoidable — it is
 * the only channel a cross-origin link has. Three things bound the exposure: the redirect
 * strips it immediately, `Referrer-Policy: no-referrer` stops it reaching any subresource,
 * and `Cache-Control: no-store` keeps it out of shared caches. Worker request logs will
 * still contain it, which is the residual cost of this design and the reason Studio should
 * link here rather than embedding the token in anything longer-lived.
 */

import { redirect } from '@remix-run/cloudflare';
import { verifyStudioJWT, isTokenRevoked, serializeStudioCookie } from '../auth/studioSession.server';

const DEFAULT_DESTINATION = '/app';

export const loader = async ({ request, context }) => {
  const { env } = context.cloudflare;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return denied('This link is missing its sign-in token.');
  }

  if (await isTokenRevoked(token, env.TOKEN_BLACKLIST)) {
    return denied('That session has been signed out. Sign in to Studio again.');
  }

  const payload = await verifyStudioJWT(token, env.JWT_SECRET);
  if (!payload) {
    return denied('That sign-in link is invalid or has expired.');
  }

  // Tie the cookie's lifetime to the token's own expiry rather than a fixed window, so the
  // two cannot disagree. A JWT that expires in ten minutes gets a ten-minute cookie.
  const maxAge = payload.exp - Math.floor(Date.now() / 1000);
  if (maxAge <= 0) {
    return denied('That sign-in link has expired.');
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
 * cookie first — a phisher could send `/studio/enter?token=…&next=https://evil.example` and
 * land a signed-in stylist on their page. Only a single leading slash is allowed: `//host`
 * and `/\host` are both protocol-relative URLs that browsers resolve off-origin.
 */
export function safeDestination(next) {
  if (typeof next !== 'string' || next === '') return DEFAULT_DESTINATION;
  if (!next.startsWith('/')) return DEFAULT_DESTINATION;
  if (next.startsWith('//') || next.startsWith('/\\')) return DEFAULT_DESTINATION;
  return next;
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
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
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
