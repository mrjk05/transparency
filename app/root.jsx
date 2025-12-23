import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
import polarisStyles from "@shopify/polaris/build/esm/styles.css";
import { AppProvider } from "@shopify/polaris";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request, context }) => {
  const url = new URL(request.url);
  const { env } = context.cloudflare;

  return json({
    apiKey: env.SHOPIFY_API_KEY || "",
    host: url.searchParams.get("host") || "",
  });
};

export default function App() {
  const { apiKey, host } = useLoaderData();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <AppProvider apiKey={apiKey} host={host} isEmbeddedApp>
          <Outlet />
        </AppProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
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
