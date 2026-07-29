import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
import polarisStyles from "@shopify/polaris/build/esm/styles.css";
import { AppProvider } from "@shopify/polaris";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request, context }) => {
  const url = new URL(request.url);
  const { env } = context.cloudflare;
  const host = url.searchParams.get("host") || "";

  // One of the two seams the Studio integration forks at (the other is `resolveAuth`).
  //
  // Embedded-ness is decided by the presence of Shopify's own parameters, NOT by who the
  // caller turned out to be. That is on purpose: this is a rendering decision — does the
  // page sit inside the Shopify admin's iframe or stand on its own — and answering it does
  // not need to be trusted. Deriving it from `resolveAuth` instead would put a KV read and
  // an HMAC verification on every document request to decide which CSS to ship.
  //
  // A Studio session has neither parameter, so it renders standalone. An embedded request
  // always has at least `host`.
  const isEmbedded = Boolean(host || url.searchParams.get("id_token"));

  return json({
    apiKey: env.SHOPIFY_API_KEY || "",
    host,
    isEmbedded,
  });
};

export default function App() {
  const { apiKey, host, isEmbedded } = useLoaderData();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {isEmbedded ? (
          <AppProvider apiKey={apiKey} host={host} isEmbeddedApp>
            <Outlet />
          </AppProvider>
        ) : (
          // Standalone (Kadwood Studio). `isEmbeddedApp` is omitted rather than set false:
          // it makes Polaris lay out for a host frame that is not there.
          <AppProvider>
            <StudioChrome>
              <Outlet />
            </StudioChrome>
          </AppProvider>
        )}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/**
 * The thin bar that tells a stylist they are still inside Kadwood, on a page that is not
 * Studio. Without it the passport wizard appears as an unlabelled Polaris screen on a
 * different domain, which reads as having been thrown out of the app.
 */
function StudioChrome({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f6f6f7" }}>
      <div
        style={{
          background: "#42141E",
          color: "#E8C7C3",
          padding: "12px 20px",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontSize: "14px",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Kadwood — Transparency Passport
      </div>
      {children}
    </div>
  );
}
export function ErrorBoundary({ error }) {
  console.error("ErrorBoundary caught:", error);
  return (
    <html>
      <head>
        <title>Oh no!</title>
        <Meta />
        <Links />
      </head>
      <body>
        <div style={{ padding: "20px", fontFamily: "system-ui, sans-serif" }}>
          <h1>Application Error</h1>
          <pre style={{ padding: "10px", background: "#f0f0f0", overflowX: "auto", whiteSpace: "pre-wrap" }}>
            {error instanceof Error ? error.stack : JSON.stringify(error, null, 2)}
          </pre>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
