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

/**
 * Name of the session cookie.
 *
 * The `__Host-` prefix is load-bearing, not decoration. This app sits at
 * transparency.kadwood.com alongside studio., members., ai-images. and sync. — and an XSS or
 * takeover on ANY of those can otherwise write
 * `Set-Cookie: kadwood_studio_session=<their JWT>; Domain=.kadwood.com`. `readStudioCookie`
 * returns the first match in the header and browsers order equal-path cookies by creation
 * time, so the injected one can quietly win and this app has no way to tell them apart.
 * With the prefix, browsers refuse any `Set-Cookie` for this name that carries a `Domain`,
 * which makes the shadowing impossible rather than merely unlikely.
 */
export const STUDIO_COOKIE = '__Host-kadwood_studio_session';

/**
 * KV key prefix for single-use hand-off tickets.
 *
 * Studio writes `studio_ticket:<opaque>` -> `<jwt>` with a short TTL and links the stylist to
 * `/studio/enter?ticket=<opaque>`. The JWT itself never travels in a URL, because it is not a
 * hand-off credential — it is Studio's live API bearer, accepted by
 * `kadwood_ai/backend/src/workers/middleware/auth.ts` for seven days. A copy of it in this
 * Worker's request log (which runs at `head_sampling_rate = 1` with `persist = true`) would
 * hand every reader of those logs full Studio API access to every client record, not merely
 * access to passports.
 */
export const TICKET_PREFIX = 'studio_ticket:';

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
 * CALL THIS ONLY AFTER `verifyStudioJWT` HAS SUCCEEDED. The key is the token string itself,
 * and `TOKEN_BLACKLIST` is shared with Studio, where the same namespace also holds live
 * `otp:<email>` sign-in codes and `webauthn_challenge:*` entries. Reading it with an
 * unverified, caller-supplied string turns this into an unauthenticated existence oracle for
 * those keys — "is victim@kadwood.com mid-login right now?" — distinguishable by which of
 * the two failure messages comes back. Requiring a valid signature first means the only keys
 * an attacker can probe are ones they could already have forged, i.e. none.
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

/**
 * Redeem a single-use hand-off ticket for the JWT behind it.
 *
 * The stored value is `{"token": "<jwt>", "expiresAt": <epoch ms>}`. Studio should also set
 * KV's own `expirationTtl`, but the lifetime is re-checked HERE because that is the side
 * that depends on it: a ticket minted without a TTL by a future version of Studio would
 * otherwise sit in KV as a permanent sign-in credential, and nothing in this repo would
 * notice. Enforce what you rely on.
 *
 * Returns the token, or null if the ticket is malformed, unknown, expired, already spent, or
 * could not be spent.
 *
 * Two honest limitations remain, both from KV rather than from choice. There is no
 * compare-and-swap, so two requests racing the same ticket can both read it before either
 * delete lands; and deletes are eventually consistent, so a spent ticket may briefly still
 * resolve at another edge. Bounded by the ticket's own TTL, and enormously better than a
 * seven-day bearer sitting in a URL.
 *
 * A failed delete is treated as a failed redemption rather than swallowed. The alternative
 * leaves the ticket redeemable for the rest of its life in precisely the case where you least
 * want that; a legitimate stylist just clicks the link again.
 *
 * The character-class check is not cosmetic: without it a caller could pass
 * `otp:victim@kadwood.com` and use this route to read Studio's other key families out of the
 * shared namespace.
 */
export async function redeemTicket(ticket, kv) {
  if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(ticket)) return null;
  if (!kv || typeof kv.get !== 'function' || typeof kv.delete !== 'function') return null;

  const key = `${TICKET_PREFIX}${ticket}`;
  try {
    const raw = await kv.get(key);
    if (raw === null) return null;

    // Spend it before anything can return the token. If this throws we fall to the catch and
    // hand back nothing.
    await kv.delete(key);

    const entry = JSON.parse(raw);
    if (!entry || typeof entry.token !== 'string' || typeof entry.expiresAt !== 'number') {
      return null;
    }
    if (Date.now() > entry.expiresAt) return null;

    return entry.token;
  } catch (error) {
    console.error('[studioSession] ticket redemption failed:', error);
    return null;
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
