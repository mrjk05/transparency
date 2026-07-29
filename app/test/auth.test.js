import { describe, it, expect } from 'vitest';

import {
  resolveAuth,
  canonicalShop,
  ADMIN_SECRET_HEADER,
  AUTH_SHOPIFY,
  AUTH_STUDIO,
  AUTH_MACHINE,
} from '../auth/resolveAuth.server';
import {
  STUDIO_COOKIE,
  TICKET_PREFIX,
  verifyStudioJWT,
  isTokenRevoked,
  redeemTicket,
  readStudioCookie,
  serializeStudioCookie,
  clearStudioCookie,
} from '../auth/studioSession.server';
import { getAdminAccessToken } from '../auth/adminToken.server';
import { safeDestination } from '../routes/studio.enter';

const JWT_SECRET = 'shared-with-kadwood-ai-backend';
const ADMIN_SECRET = 'studio-to-transparency';

/**
 * Mint a JWT the way kadwood-ai-backend does. This is a deliberate copy of
 * `kadwood_ai/backend/src/lib/auth.ts:createJWT` — if the two ever diverge these tests are
 * the thing that notices, so it must not be refactored to call our own verifier's helpers.
 */
async function mintJWT(payload, { secret = JWT_SECRET, alg = 'HS256' } = {}) {
  const encode = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const headerB64 = encode({ alg, typ: 'JWT' });
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
const past = () => Math.floor(Date.now() / 1000) - 60;

function fakeKV(revoked = [], entries = {}) {
  const set = new Set(revoked);
  const store = new Map(Object.entries(entries));
  return {
    get: async (key) => (set.has(key) ? '1' : store.has(key) ? store.get(key) : null),
    delete: async (key) => { store.delete(key); },
    has: (key) => store.has(key),
  };
}

function makeEnv(overrides = {}) {
  return {
    JWT_SECRET,
    STUDIO_ADMIN_SECRET: ADMIN_SECRET,
    SHOPIFY_API_SECRET: 'shopify-app-secret',
    TOKEN_BLACKLIST: fakeKV(),
    ...overrides,
  };
}

function req(url, headers = {}) {
  return new Request(url, { headers });
}

describe('canonicalShop', () => {
  it('accepts a bare myshopify domain', () => {
    expect(canonicalShop('kadwood.myshopify.com')).toBe('kadwood.myshopify.com');
  });

  it('strips scheme, /admin and trailing slashes', () => {
    expect(canonicalShop('https://kadwood.myshopify.com/admin')).toBe('kadwood.myshopify.com');
    expect(canonicalShop('https://kadwood.myshopify.com/')).toBe('kadwood.myshopify.com');
    expect(canonicalShop('  KADWOOD.MyShopify.com  ')).toBe('kadwood.myshopify.com');
  });

  it('folds the store\'s former handle onto the canonical one', () => {
    // Otherwise one commission files under two shop_domains and neither list is complete.
    expect(canonicalShop('limitedcollective.myshopify.com')).toBe('kadwood.myshopify.com');
  });

  it('keeps the dev store distinct', () => {
    expect(canonicalShop('kaddev1.myshopify.com')).toBe('kaddev1.myshopify.com');
  });

  it('rejects anything that is not a myshopify domain', () => {
    for (const bad of ['', '   ', null, undefined, 42, 'evil.com', 'kadwood.myshopify.com.evil.com',
                       'https://evil.com/kadwood.myshopify.com', '.myshopify.com']) {
      expect(canonicalShop(bad)).toBeNull();
    }
  });
});

describe('verifyStudioJWT', () => {
  it('accepts a token minted by Studio', async () => {
    const token = await mintJWT({ sub: 'user-1', email: 'a@kadwood.com', exp: future() });
    const payload = await verifyStudioJWT(token, JWT_SECRET);
    expect(payload?.sub).toBe('user-1');
    expect(payload?.email).toBe('a@kadwood.com');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await mintJWT({ sub: 'user-1', exp: future() }, { secret: 'not-the-secret' });
    expect(await verifyStudioJWT(token, JWT_SECRET)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await mintJWT({ sub: 'user-1', exp: past() });
    expect(await verifyStudioJWT(token, JWT_SECRET)).toBeNull();
  });

  it('rejects a token with no exp', async () => {
    const token = await mintJWT({ sub: 'user-1' });
    expect(await verifyStudioJWT(token, JWT_SECRET)).toBeNull();
  });

  it('rejects alg: none', async () => {
    const token = await mintJWT({ sub: 'user-1', exp: future() }, { alg: 'none' });
    expect(await verifyStudioJWT(token, JWT_SECRET)).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const token = await mintJWT({ sub: 'user-1', exp: future() });
    const [h, , s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin', exp: future() }))
      .toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    expect(await verifyStudioJWT(`${h}.${forged}.${s}`, JWT_SECRET)).toBeNull();
  });

  it('rejects malformed input without throwing', async () => {
    for (const bad of ['', 'a.b', 'a.b.c.d', 'not-a-jwt', null, undefined]) {
      expect(await verifyStudioJWT(bad, JWT_SECRET)).toBeNull();
    }
  });

  it('refuses to verify when the secret is unset', async () => {
    const token = await mintJWT({ sub: 'user-1', exp: future() });
    expect(await verifyStudioJWT(token, '')).toBeNull();
    expect(await verifyStudioJWT(token, undefined)).toBeNull();
  });
});

describe('isTokenRevoked', () => {
  it('reports a blacklisted token as revoked', async () => {
    expect(await isTokenRevoked('tok', fakeKV(['tok']))).toBe(true);
    expect(await isTokenRevoked('tok', fakeKV())).toBe(false);
  });

  it('fails closed when the binding is missing or throws', async () => {
    expect(await isTokenRevoked('tok', undefined)).toBe(true);
    expect(await isTokenRevoked('tok', {})).toBe(true);
    expect(await isTokenRevoked('tok', { get: async () => { throw new Error('kv down'); } })).toBe(true);
  });
});

describe('session cookie', () => {
  it('round-trips through the Cookie header', () => {
    const header = serializeStudioCookie('abc.def.ghi', 3600);
    const value = header.split(';')[0].split('=').slice(1).join('=');
    expect(readStudioCookie(req('https://x.test/', { Cookie: `${STUDIO_COOKIE}=${value}` })))
      .toBe('abc.def.ghi');
  });

  it('carries the security attributes the plan requires', () => {
    const header = serializeStudioCookie('abc.def.ghi', 3600);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('Secure');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/');
    expect(header).toContain('Max-Age=3600');
  });

  it('refuses a value that could forge a second cookie attribute', () => {
    expect(() => serializeStudioCookie('abc; Domain=evil.example', 3600)).toThrow();
    expect(() => serializeStudioCookie('', 3600)).toThrow();
  });

  it('finds its cookie among others and ignores lookalikes', () => {
    const header = `other=1; ${STUDIO_COOKIE}=wanted; not_${STUDIO_COOKIE}=decoy`;
    expect(readStudioCookie(req('https://x.test/', { Cookie: header }))).toBe('wanted');
  });

  it('returns null when absent or empty', () => {
    expect(readStudioCookie(req('https://x.test/'))).toBeNull();
    expect(readStudioCookie(req('https://x.test/', { Cookie: 'a=1; b=2' }))).toBeNull();
    expect(readStudioCookie(req('https://x.test/', { Cookie: `${STUDIO_COOKIE}=` }))).toBeNull();
  });

  it('expires on clear', () => {
    expect(clearStudioCookie()).toContain('Max-Age=0');
  });
});

describe('safeDestination', () => {
  it('keeps a same-origin path', () => {
    expect(safeDestination('/app/create-report?orderId=1')).toBe('/app/create-report?orderId=1');
  });

  it('refuses anything that leaves this origin', () => {
    for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example',
                       'app/create-report', '', null, undefined, 42]) {
      expect(safeDestination(bad)).toBe('/app');
    }
  });
});

describe('resolveAuth', () => {
  it('rejects a request with no credentials', async () => {
    const result = await resolveAuth(req('https://t.test/app'), makeEnv());
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  describe('studio cookie', () => {
    it('authenticates a valid cookie and pins the canonical shop', async () => {
      const token = await mintJWT({ sub: 'user-1', email: 'a@kadwood.com', exp: future() });
      const result = await resolveAuth(
        req('https://t.test/app', { Cookie: `${STUDIO_COOKIE}=${token}` }),
        makeEnv()
      );
      expect(result).toMatchObject({
        ok: true,
        mode: AUTH_STUDIO,
        shop: 'kadwood.myshopify.com',
        userId: 'user-1',
        email: 'a@kadwood.com',
      });
    });

    it('rejects a revoked token even though its signature is good', async () => {
      const token = await mintJWT({ sub: 'user-1', exp: future() });
      const result = await resolveAuth(
        req('https://t.test/app', { Cookie: `${STUDIO_COOKIE}=${token}` }),
        makeEnv({ TOKEN_BLACKLIST: fakeKV([token]) })
      );
      expect(result.ok).toBe(false);
      // Deliberately the SAME string as an invalid token: distinguishing the two turns the
      // shared KV namespace into an existence oracle for Studio's live OTP keys.
      expect(result.reason).toBe('invalid or expired studio session');
    });

    it('rejects an expired token', async () => {
      const token = await mintJWT({ sub: 'user-1', exp: past() });
      const result = await resolveAuth(
        req('https://t.test/app', { Cookie: `${STUDIO_COOKIE}=${token}` }),
        makeEnv()
      );
      expect(result.ok).toBe(false);
    });

    it('fails closed when TOKEN_BLACKLIST is not bound', async () => {
      const token = await mintJWT({ sub: 'user-1', exp: future() });
      const result = await resolveAuth(
        req('https://t.test/app', { Cookie: `${STUDIO_COOKIE}=${token}` }),
        makeEnv({ TOKEN_BLACKLIST: undefined })
      );
      expect(result.ok).toBe(false);
    });
  });

  describe('machine secret', () => {
    const machineOpts = { allow: [AUTH_MACHINE] };

    it('is not accepted by routes that did not opt in', async () => {
      const result = await resolveAuth(
        req('https://t.test/app?shopDomain=kadwood.myshopify.com',
            { [ADMIN_SECRET_HEADER]: ADMIN_SECRET }),
        makeEnv()
      );
      expect(result.ok).toBe(false);
    });

    it('authenticates with the right secret and an explicit shop', async () => {
      const result = await resolveAuth(
        req('https://t.test/api/studio/reports?shopDomain=kadwood.myshopify.com',
            { [ADMIN_SECRET_HEADER]: ADMIN_SECRET }),
        makeEnv(),
        machineOpts
      );
      expect(result).toMatchObject({ ok: true, mode: AUTH_MACHINE, shop: 'kadwood.myshopify.com' });
    });

    it('rejects the wrong secret', async () => {
      const result = await resolveAuth(
        req('https://t.test/api/studio/reports?shopDomain=kadwood.myshopify.com',
            { [ADMIN_SECRET_HEADER]: 'wrong' }),
        makeEnv(),
        machineOpts
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid admin secret');
    });

    it('cannot be satisfied by an empty header when the secret is unset', async () => {
      for (const presented of ['', 'anything']) {
        const result = await resolveAuth(
          req('https://t.test/api/studio/reports?shopDomain=kadwood.myshopify.com',
              { [ADMIN_SECRET_HEADER]: presented }),
          makeEnv({ STUDIO_ADMIN_SECRET: undefined }),
          machineOpts
        );
        expect(result.ok).toBe(false);
      }
    });

    it('requires a valid shopDomain', async () => {
      for (const q of ['', '?shopDomain=', '?shopDomain=evil.com',
                       '?shopDomain=attacker.myshopify.com']) {
        const result = await resolveAuth(
          req(`https://t.test/api/studio/reports${q}`, { [ADMIN_SECRET_HEADER]: ADMIN_SECRET }),
          makeEnv(),
          machineOpts
        );
        expect(result.ok).toBe(false);
        expect(result.status).toBe(400);
      }
    });

    it('does not fall through to a cookie once the header is present', async () => {
      // A bad secret must fail as a machine attempt rather than quietly succeeding as a human.
      const token = await mintJWT({ sub: 'user-1', exp: future() });
      const result = await resolveAuth(
        req('https://t.test/app?shopDomain=kadwood.myshopify.com', {
          [ADMIN_SECRET_HEADER]: 'wrong',
          Cookie: `${STUDIO_COOKIE}=${token}`,
        }),
        makeEnv(),
        { allow: [AUTH_MACHINE, AUTH_STUDIO] }
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid admin secret');
    });
  });

  describe('shopify session token', () => {
    it('rejects a forged id_token', async () => {
      const result = await resolveAuth(
        req('https://t.test/app?id_token=not.a.token'),
        makeEnv()
      );
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
    });

    it('does not fall through to the cookie when id_token is present but bad', async () => {
      const token = await mintJWT({ sub: 'user-1', exp: future() });
      const result = await resolveAuth(
        req('https://t.test/app?id_token=not.a.token', { Cookie: `${STUDIO_COOKIE}=${token}` }),
        makeEnv()
      );
      expect(result.ok).toBe(false);
      expect(result.mode).toBeUndefined();
    });

    it('takes precedence over a cookie when both are valid', async () => {
      const idToken = await mintJWT(
        { sub: 'shopify-user', dest: 'https://kadwood.myshopify.com', exp: future() },
        { secret: 'shopify-app-secret' }
      );
      const cookieToken = await mintJWT({ sub: 'studio-user', exp: future() });
      const result = await resolveAuth(
        req(`https://t.test/app?id_token=${idToken}`, { Cookie: `${STUDIO_COOKIE}=${cookieToken}` }),
        makeEnv()
      );
      expect(result).toMatchObject({ ok: true, mode: AUTH_SHOPIFY, userId: 'shopify-user' });
    });

    it('canonicalises the shop named by the token', async () => {
      const idToken = await mintJWT(
        { sub: 'u', dest: 'https://limitedcollective.myshopify.com', exp: future() },
        { secret: 'shopify-app-secret' }
      );
      const result = await resolveAuth(req(`https://t.test/app?id_token=${idToken}`), makeEnv());
      expect(result).toMatchObject({ ok: true, shop: 'kadwood.myshopify.com' });
    });
  });
});
