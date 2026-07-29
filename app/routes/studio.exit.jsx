/**
 * `POST /studio/exit` — sign out of the Studio session on this app.
 *
 * This exists because without it a stylist has no way to drop the cookie. Studio's own
 * logout blacklists the JWT, which does eventually close this door too — but only for the
 * token Studio knows about, and only once the stylist thinks to go and do it there. If
 * someone ever lands here on a session that is not theirs, they need a control on this page.
 *
 * POST rather than GET on purpose: it changes state, and a GET logout can be triggered by
 * any image tag on any page.
 */

import { redirect } from '@remix-run/cloudflare';
import { clearStudioCookie } from '../auth/studioSession.server';

export const action = async () =>
  redirect('/studio/signed-out', {
    headers: {
      'Set-Cookie': clearStudioCookie(),
      'Cache-Control': 'no-store',
    },
  });

// A bare GET has nothing to show and must not sign anyone out as a side effect.
export const loader = async () => redirect('/app');
