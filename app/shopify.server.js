
import {
    AppDistribution,
    shopifyApp,
    LATEST_API_VERSION,
} from "@shopify/shopify-app-remix/server";
import { MemorySessionStorage } from "@shopify/shopify-app-session-storage-memory";

let _shopify = null;

export function initShopify(env) {
    if (_shopify) return _shopify;

    _shopify = shopifyApp({
        apiKey: env.SHOPIFY_API_KEY,
        apiSecretKey: env.SHOPIFY_API_SECRET || "",
        apiVersion: LATEST_API_VERSION,
        scopes: env.SCOPES?.split(","),
        appUrl: env.SHOPIFY_APP_URL || "",
        authPathPrefix: "/auth",
        sessionStorage: new MemorySessionStorage(),
        distribution: AppDistribution.AppStore,
        future: {
            v3_webhookAdminContext: true,
            v3_authenticatePublic: true,
        },
        hooks: {
            afterAuth: async ({ session }) => {
                _shopify.registerWebhooks({ session });
            },
        },
    });
    return _shopify;
}
