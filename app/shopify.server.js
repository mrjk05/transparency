
import {
    AppDistribution,
    shopifyApp,
    LATEST_API_VERSION,
} from "@shopify/shopify-app-remix/server";
import { D1SessionStorage } from "./db/session.server";

export function initShopify(env) {
    console.log("[initShopify] Initializing...");
    try {
        if (!env.DB) {
            console.error("[initShopify] env.DB is missing!");
            throw new Error("env.DB is missing");
        }
        const sessionStorage = new D1SessionStorage(env.DB);
        console.log("[initShopify] Session storage created");

        const shopify = shopifyApp({
            apiKey: env.SHOPIFY_API_KEY,
            apiSecretKey: env.SHOPIFY_API_SECRET || "",
            apiVersion: LATEST_API_VERSION,
            scopes: env.SCOPES?.split(","),
            appUrl: env.SHOPIFY_APP_URL || "",
            authPathPrefix: "/auth",
            sessionStorage: sessionStorage,
            distribution: AppDistribution.AppStore,
            future: {
                v3_webhookAdminContext: true,
                v3_authenticatePublic: true,
            },
            hooks: {
                afterAuth: async ({ session }) => {
                    console.log("[afterAuth] Registering webhooks for session:", session.id);
                    shopify.registerWebhooks({ session });
                },
            },
        });
        console.log("[initShopify] shopifyApp initialized successfully");
        return shopify;
    } catch (error) {
        console.error("[initShopify] Error initializing shopifyApp:", error);
        throw error;
    }
}
