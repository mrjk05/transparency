/**
 * Verify Shopify session tokens (id_token) for embedded apps
 * Based on: https://shopify.dev/docs/apps/auth/session-tokens
 */

export async function verifySessionToken(request, apiSecret) {
    const url = new URL(request.url);
    const token = url.searchParams.get('id_token');

    if (!token) {
        return { ok: false, reason: 'missing id_token' };
    }

    try {
        // JWT format: header.payload.signature
        const parts = token.split('.');
        if (parts.length !== 3) {
            return { ok: false, reason: 'invalid token format' };
        }

        const [headerB64, payloadB64, signatureB64] = parts;

        // Decode payload
        const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(payloadJson);

        // Verify expiration
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
            return { ok: false, reason: 'token expired' };
        }

        if (payload.nbf && payload.nbf > now) {
            return { ok: false, reason: 'token not yet valid' };
        }

        // Verify signature using HMAC SHA-256
        const data = `${headerB64}.${payloadB64}`;
        const encoder = new TextEncoder();
        const keyData = encoder.encode(apiSecret);
        const messageData = encoder.encode(data);

        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
        const signatureB64Url = btoa(String.fromCharCode(...new Uint8Array(signature)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');

        if (signatureB64Url !== signatureB64) {
            return { ok: false, reason: 'invalid signature' };
        }

        // Extract shop and user info
        const shop = payload.dest?.replace('https://', '').replace('/admin', '') || '';
        const userId = payload.sub;

        return {
            ok: true,
            shop,
            userId,
            payload
        };
    } catch (error) {
        console.error('[verifySessionToken] Error:', error);
        return { ok: false, reason: error.message };
    }
}
