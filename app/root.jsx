import {
  Form,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLoaderData,
  useRouteError,
} from "@remix-run/react";
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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        <span>Kadwood — Transparency Passport</span>
        {/*
          POST, not a link: signing out changes state, and a GET logout fires from any image
          tag on any page. This is also the only way to drop a session that is not yours —
          Studio's own logout only revokes the token it knows about.

          `reloadDocument` is required, not stylistic. /studio/signed-out is a resource route
          (a loader returning raw HTML, no default export), and Remix only serves that HTML
          for document requests. Left to the client router, the POST redirects, the card is
          fetched, stringified into loaderData and thrown away, and the stylist is left on an
          empty page still showing this button.
        */}
        <Form method="post" action="/studio/exit" reloadDocument>
          <button
            type="submit"
            style={{
              background: "transparent",
              border: "1px solid #E8C7C3",
              color: "#E8C7C3",
              borderRadius: "4px",
              padding: "4px 12px",
              font: "inherit",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </Form>
      </div>
      {children}
    </div>
  );
}

/**
 * Remix v2 renders a route's `ErrorBoundary` export with NO props — the error comes from
 * `useRouteError()`. The previous version destructured `{ error }`, which was always
 * `undefined`, so `undefined instanceof Error` was false and `JSON.stringify(undefined)`
 * returned `undefined`: every error rendered as "Application Error" above an empty box, with
 * the actual reason discarded. That matters more now that routes throw 401 Responses with a
 * message worth reading.
 */
export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    const isAuth = error.status === 401 || error.status === 403;
    return (
      <html lang="en">
        <head>
          <title>{isAuth ? "Not signed in" : `Error ${error.status}`}</title>
          <Meta />
          <Links />
        </head>
        <body>
          <div style={{ padding: "40px", fontFamily: "system-ui, sans-serif", maxWidth: "480px" }}>
            <h1 style={{ fontSize: "20px" }}>{isAuth ? "Not signed in" : `Error ${error.status}`}</h1>
            <p style={{ color: "#6d7175", lineHeight: 1.5 }}>
              {typeof error.data === "string" && error.data ? error.data : error.statusText}
            </p>
            {isAuth && (
              <p style={{ color: "#6d7175", lineHeight: 1.5 }}>
                Open this app from the Shopify admin, or from Kadwood Studio under Tools.
              </p>
            )}
          </div>
          <Scripts />
        </body>
      </html>
    );
  }

  console.error("ErrorBoundary caught:", error);
  return (
    <html lang="en">
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
