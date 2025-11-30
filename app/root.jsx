import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "@remix-run/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { ClientOnly } from "./components/ClientOnly";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <ClientOnly>
          <AppProvider isEmbeddedApp={false} apiKey="test">
            <Outlet />
          </AppProvider>
        </ClientOnly>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
