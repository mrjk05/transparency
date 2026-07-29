/**
 * Where `/studio/exit` lands. Deliberately a plain page with no session and no Polaris
 * chrome — whatever went wrong, this has to render for someone holding no valid cookie.
 */

export const loader = async () =>
  new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Signed out — Kadwood Transparency</title>
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
    <h1>Signed out</h1>
    <p>Your Transparency Passport session on this device has been cleared. Return to Kadwood
       Studio and open Transparency Passport again from Tools.</p>
  </div>
</body>
</html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    }
  );
