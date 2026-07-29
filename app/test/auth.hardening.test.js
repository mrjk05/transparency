/**
 * Regression tests for the specific holes an adversarial review found in the first cut of
 * this PR. Kept in their own file so it stays obvious which assertions exist because
 * something was actually broken, rather than because the behaviour seemed worth asserting.
 *
 * Every control character below is written as a JS escape ("\u0009", never a literal tab):
 * a raw control byte or U+2028 in a source file is itself a hazard.
 */

import { describe, it, expect } from 'vitest';

import { resolveAuth, AUTH_STUDIO, AUTH_MACHINE } from '../auth/resolveAuth.server';
import {
  STUDIO_COOKIE,
  TICKET_PREFIX,
  redeemTicket,
  serializeStudioCookie,
} from '../auth/studioSession.server';
import { getAdminAccessToken } from '../auth/adminToken.server';
import { safeDestination } from '../routes/studio.enter';

const JWT_SECRET = 'shared-with-kadwood-ai-backend';

async function mintJWT(payload, secret = JWT_SECRET) {
  const encode = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const headerB64 = encode({ alg: 'HS256', typ: 'JWT' });
  const payloadB64 = encode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const signatureB64 = Buffer.from(new Uint8Array(signature))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${signingInput}.${signatureB64}`;
}

const future = () => Math.floor(Date.now() / 1000) + 3600;

function fakeKV(revoked = [], entries = {}) {
  const set = new Set(revoked);
  const store = new Map(Object.entries(entries));
  return {
    get: async (key) => (set.has(key) ? '1' : store.has(key) ? store.get(key) : null),
    delete: async (key) => {
      store.delete(key);
    },
    has: (key) => store.has(key),
  };
}

const makeEnv = (overrides = {}) => ({
  JWT_SECRET,
  STUDIO_ADMIN_SECRET: 'studio-to-transparency',
  SHOPIFY_API_SECRET: 'shopify-app-secret',
  TOKEN_BLACKLIST: fakeKV(),
  ...overrides,
});

const req = (url, headers = {}) => new Request(url, { headers });

const ticketValue = (token, expiresAt = Date.now() + 60_000) =>
  JSON.stringify({ token, expiresAt });

describe('safeDestination - control-character smuggling', () => {
  // The WHATWG URL parser strips U+0009/U+000A/U+000D from a URL BEFORE parsing it. So
  // `/<TAB>/evil.example` starts with a single slash, is not `//`, is not `/\` - and still
  // becomes protocol-relative `//evil.example` in the browser. The first cut of this
  // function shipped with exactly that hole, and the endpoint hands out a session cookie on
  // the way through, so the victim arrives at the attacker's page already signed in.
  it('refuses a tab-smuggled protocol-relative URL', () => {
    expect(safeDestination('/\u0009/evil.example')).toBe('/app');
    expect(safeDestination('/\u0009\u0009//evil.example')).toBe('/app');
    expect(safeDestination('/\u0009\\evil.example')).toBe('/app');
  });

  it('refuses newline and carriage-return variants', () => {
    // These previously produced a 500, not a 401: workerd rejects CR/LF in a Location
    // header, so redirect() threw from inside the loader.
    expect(safeDestination('/\u000A/evil.example')).toBe('/app');
    expect(safeDestination('/\u000D/evil.example')).toBe('/app');
    expect(safeDestination('/\u000D\u000A/evil.example')).toBe('/app');
  });

  it('strips a header-injection attempt rather than 500ing on it', () => {
    expect(safeDestination('/a\u000D\u000AX-Injected:1')).toBe('/aX-Injected:1');
  });

  it('refuses other control characters, the BOM and the JS line separators', () => {
    expect(safeDestination('/\u0000/evil.example')).toBe('/app');
    expect(safeDestination('/\u001F/evil.example')).toBe('/app');
    expect(safeDestination('/\u007F/evil.example')).toBe('/app');
    expect(safeDestination('/\uFEFF/evil.example')).toBe('/app');
    expect(safeDestination('/\u2028/evil.example')).toBe('/app');
    expect(safeDestination('/\u2029/evil.example')).toBe('/app');
  });

  // Fixing the tab bypass by resolving against a probe origin introduced a WORSE hole than
  // it closed: WHATWG path normalisation can synthesise a leading `//` from input that had
  // none. `/..//evil.example` normalises to the segments ['', 'evil.example'], which
  // serialise as `//evil.example` — a same-origin resolved URL whose *pathname* is
  // protocol-relative once it is emitted as a bare Location. Returning `next` untouched, as
  // the very first version did, was accidentally safe against this.
  it('refuses a path that NORMALISES into a protocol-relative URL', () => {
    for (const bad of [
      '/..//evil.example',
      '/.//evil.example',
      '/../..//evil.example',
      '/app/..//evil.example',
      '/%2e%2e//evil.example',
      '/..//user@evil.example',
      '/.\u0009.//evil.example',
    ]) {
      expect(safeDestination(bad)).toBe('/app');
    }
  });

  // A Studio hand-off carrying Shopify's parameters poisons every later in-app link via
  // `withSearch`, and locks the session out of the Studio branch of resolveAuth.
  it('strips Shopify context parameters from the destination', () => {
    expect(safeDestination('/app?shop=kadwood.myshopify.com')).toBe('/app');
    expect(safeDestination('/app?host=abc&embedded=1&id_token=x')).toBe('/app');
    expect(safeDestination('/app?orderId=7&shop=x')).toBe('/app?orderId=7');
  });

  it('keeps a fragment', () => {
    expect(safeDestination('/app/passport/abc#supply-chain')).toBe('/app/passport/abc#supply-chain');
  });

  it('still allows an ordinary path with a query', () => {
    expect(safeDestination('/app/create-report?orderId=1&cursor=abc')).toBe(
      '/app/create-report?orderId=1&cursor=abc'
    );
  });

  it('never returns anything that could resolve off-origin', () => {
    for (const candidate of [
      '/\u0009/evil.example',
      '//evil.example',
      '/\\evil.example',
      'https://evil.example',
      '/app#frag',
      '/app?next=//evil.example',
      // The normalisation family. Without these the suite passed while the redirect was open.
      '/..//evil.example',
      '/.//evil.example',
      '/app/..//evil.example',
      '/..//user@evil.example',
    ]) {
      const resolved = new URL(safeDestination(candidate), 'https://ok.invalid');
      expect(resolved.origin).toBe('https://ok.invalid');
    }
  });
});

describe('redeemTicket', () => {
  const TICKET = 'a'.repeat(43);

  it('returns the token behind a valid ticket and spends it', async () => {
    const kv = fakeKV([], { [`${TICKET_PREFIX}${TICKET}`]: ticketValue('the.jwt.here') });
    expect(await redeemTicket(TICKET, kv)).toBe('the.jwt.here');
    expect(kv.has(`${TICKET_PREFIX}${TICKET}`)).toBe(false);
    expect(await redeemTicket(TICKET, kv)).toBeNull();
  });

  it('returns null for an unknown ticket', async () => {
    expect(await redeemTicket(TICKET, fakeKV())).toBeNull();
  });

  it('refuses to look up anything but a well-formed ticket', async () => {
    // TOKEN_BLACKLIST is shared with Studio, where the same namespace holds live
    // `otp:<email>` sign-in codes and WebAuthn challenges. Without the character-class check
    // this route reads arbitrary keys out of it for an unauthenticated caller.
    const kv = fakeKV([], { 'otp:victim@kadwood.com': '{"code":"123456"}' });
    for (const bad of [
      'otp:victim@kadwood.com',
      '../otp:victim@kadwood.com',
      '',
      'short',
      'a'.repeat(200),
      null,
      undefined,
      42,
    ]) {
      expect(await redeemTicket(bad, kv)).toBeNull();
    }
    expect(kv.has('otp:victim@kadwood.com')).toBe(true);
  });

  it('enforces the ticket lifetime locally', async () => {
    // Studio is expected to set KV's own expirationTtl, but this is the side that depends on
    // the ticket being short-lived, so it re-checks rather than trusting a repo that has not
    // been written yet.
    const kv = fakeKV([], { [`${TICKET_PREFIX}${TICKET}`]: ticketValue('the.jwt', Date.now() - 1) });
    expect(await redeemTicket(TICKET, kv)).toBeNull();
  });

  it('rejects a malformed stored value', async () => {
    for (const raw of ['not json', '{}', '{"token":123,"expiresAt":0}', 'null',
                       JSON.stringify({ token: 'x' })]) {
      const kv = fakeKV([], { [`${TICKET_PREFIX}${TICKET}`]: raw });
      expect(await redeemTicket(TICKET, kv)).toBeNull();
    }
  });

  it('refuses the redemption when the ticket cannot be spent', async () => {
    // Swallowing this would leave the ticket redeemable for the rest of its life in exactly
    // the case where that is least acceptable.
    const kv = fakeKV([], { [`${TICKET_PREFIX}${TICKET}`]: ticketValue('the.jwt') });
    kv.delete = async () => { throw new Error('kv down'); };
    expect(await redeemTicket(TICKET, kv)).toBeNull();
  });

  it('returns null when the binding is missing or cannot delete', async () => {
    expect(await redeemTicket(TICKET, undefined)).toBeNull();
    expect(await redeemTicket(TICKET, {})).toBeNull();
    expect(await redeemTicket(TICKET, { get: async () => 'x' })).toBeNull();
  });
});

describe('session cookie name', () => {
  it('claims __Host- so a sibling kadwood.com subdomain cannot shadow it', () => {
    expect(STUDIO_COOKIE.startsWith('__Host-')).toBe(true);
    // The prefix is only honoured when all three of these hold.
    const header = serializeStudioCookie('a.b.c', 60);
    expect(header).toContain('Secure');
    expect(header).toContain('Path=/');
    expect(header).not.toContain('Domain=');
  });
});

describe('a Studio cookie cannot rescue a Shopify-admin request', () => {
  // Otherwise an embedded request whose id_token went stale falls through to the Studio
  // branch, which pins the canonical shop and then draws on the app-level offline Admin
  // token - so a dev-store screen lists production orders, and a passport can be filed
  // against a production order from a dev session.
  for (const param of ['host=abc', 'embedded=1', 'shop=kaddev1.myshopify.com']) {
    it(`refuses when ?${param.split('=')[0]} is present`, async () => {
      const token = await mintJWT({ sub: 'user-1', exp: future() });
      const result = await resolveAuth(
        req(`https://t.test/app?${param}`, { Cookie: `${STUDIO_COOKIE}=${token}` }),
        makeEnv()
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('no credentials presented');
    });
  }

  it('still authenticates a genuine Studio request', async () => {
    const token = await mintJWT({ sub: 'user-1', exp: future() });
    const result = await resolveAuth(
      req('https://t.test/app', { Cookie: `${STUDIO_COOKIE}=${token}` }),
      makeEnv()
    );
    expect(result).toMatchObject({ ok: true, mode: AUTH_STUDIO });
  });
});

describe('getAdminAccessToken', () => {
  const env = { SHOPIFY_ADMIN_TOKEN: 'shpat_offline' };

  it('releases the offline token for the canonical shop', async () => {
    const auth = { mode: AUTH_STUDIO, shop: 'kadwood.myshopify.com' };
    expect(await getAdminAccessToken(req('https://t.test/app'), env, auth)).toBe('shpat_offline');
  });

  it('refuses to release it for any other shop', async () => {
    // In machine mode `shop` arrives as a caller-supplied query parameter and is then
    // interpolated into `https://${shop}/admin/api/...` with this token in a request header.
    // Releasing it for an arbitrary shop posts a long-lived, write-capable credential to a
    // host the caller chose.
    for (const shop of ['kaddev1.myshopify.com', 'attacker.myshopify.com']) {
      const auth = { mode: AUTH_MACHINE, shop };
      expect(await getAdminAccessToken(req('https://t.test/api'), env, auth)).toBeNull();
    }
  });

  it('returns null when no offline token is configured', async () => {
    const auth = { mode: AUTH_STUDIO, shop: 'kadwood.myshopify.com' };
    expect(await getAdminAccessToken(req('https://t.test/app'), {}, auth)).toBeNull();
  });
});
