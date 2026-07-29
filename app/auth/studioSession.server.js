/**
 * Kadwood Studio session — JWT verification and the cookie that carries it.
 *
 * Studio (kadwood-ai-backend) mints HS256 JWTs and keeps them in localStorage. That works
 * there because every authenticated call is a `fetch` the client attaches a header to.
 * It does NOT work here: this is a Remix app, so the things that need to know who you are
 * are *loaders*, which run on the server before any of our JavaScript exists. A token in
 * localStorage is invisible to them. Hence a cookie — the one credential the browser sends
 * on a plain document request.
 *
 * `verifyStudioJWT` is deliberately a re-implementation of, and must stay byte-compatible
 * with, `kadwood_ai/backend/src/lib/auth.ts:verifyJWT`. Both sign with `JWT_SECRET`, and the
 * two workers MUST be given the same value or every Studio hand-off fails at the door. The
 * duplication is the price of the two repos not sharing a package; the base64url padding
 * dance below is copied from there for exactly that reason.
 */

/** Name of the session cookie. Host-scoped; nothing else on the domain reads it. */
export const STUDIO_COOKIE = 'kadwood_studio_session';

/**
 * Verify a Studio JWT.
 *
 * Returns the payload, or null for every failure mode — malformed, wrong algorithm, bad
 * signature, expired. Callers get no detail because there is no caller who can act on the
 * difference, and the distinctions are useful mainly to someone probing the endpoint.
 */
export async function verifyStudioJWT(token, secret) {
  if (typeof token !== 'string' || typeof secret !== 'string' || secret === '') {
    return null;
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    // Pin the algorithm. Verifying with HMAC already rejects `alg: none` (the signature
    // would not match), but rejecting it by name means a future reader does not have to
    // reconstruct that argument to convince themselves this is safe.
    const header = decodeSegment(headerB64);
    if (!header || header.alg !== 'HS256') return null;

    const signingInput = `${headerB64}.${payloadB64}`;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBytes = base64UrlToBytes(signatureB64);
    if (!signatureBytes) return null;

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      new TextEncoder().encode(signingInput)
    );
    if (!valid) return null;

    const payload = decodeSegment(payloadB64);
    if (!payload || typeof payload.sub !== 'string' || payload.sub === '') return null;

    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Has this exact token been revoked?
 *
 * Studio's logout writes the token string into `TOKEN_BLACKLIST` KV. Without this check a
 * "sign out" in Studio would leave the passport wizard open here for the remainder of the
 * token's seven days. One KV read per authenticated request is what makes a week-long
 * cookie defensible.
 *
 * Fails CLOSED: if the binding is missing we cannot know whether the token was revoked, and
 * the safe answer to "is this revoked?" under uncertainty is yes.
 */
export async function isTokenRevoked(token, kv) {
  if (!kv || typeof kv.get !== 'function') return true;
  try {
    return (await kv.get(token)) !== null;
  } catch {
    return true;
  }
}

/** Read the session cookie off a request, or null. */
export function readStudioCookie(request) {
  const header = request.headers.get('Cookie');
  if (!header) return null;

  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() !== STUDIO_COOKIE) continue;

    const value = pair.slice(eq + 1).trim();
    return value === '' ? null : value;
  }
  return null;
}

/**
 * Serialize the session cookie.
 *
 * `maxAgeSeconds` is derived from the JWT's own `exp` rather than a fixed window, so the
 * cookie and the credential inside it die together. A cookie that outlives its token just
 * produces a confusing 401 on a page the user thought they were signed in to.
 *
 * `Secure` is unconditional. Browsers treat `localhost` as a trustworthy origin, so this
 * does not break `wrangler dev`.
 */
export function serializeStudioCookie(token, maxAgeSeconds) {
  if (!isCookieSafe(token)) {
    throw new Error('refusing to set a session cookie containing a delimiter');
  }
  const maxAge = Math.max(0, Math.floor(maxAgeSeconds));
  return `${STUDIO_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

/** Expire the session cookie. */
export function clearStudioCookie() {
  return `${STUDIO_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/**
 * A JWT is base64url plus two dots, so it can never contain a character that would let it
 * escape its own cookie and forge a second attribute. This asserts that rather than assuming
 * it — the cost is one regex on a path that runs once per sign-in.
 */
function isCookieSafe(value) {
  return typeof value === 'string' && value !== '' && /^[A-Za-z0-9._~+/=-]+$/.test(value);
}

function base64UrlToBytes(segment) {
  try {
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4;
    const binary = atob(pad ? padded + '='.repeat(4 - pad) : padded);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function decodeSegment(segment) {
  try {
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4;
    const parsed = JSON.parse(atob(pad ? padded + '='.repeat(4 - pad) : padded));
    return parsed !== null && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
