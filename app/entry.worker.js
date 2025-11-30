import { createRequestHandler } from "@remix-run/cloudflare";
import * as build from "@remix-run/dev/server-build";
import { getAssetFromKV, MethodNotAllowedError, NotFoundError } from "@cloudflare/kv-asset-handler";
import manifestJSON from "__STATIC_CONTENT_MANIFEST";

const assetManifest = JSON.parse(manifestJSON);

export default {
    async fetch(request, env, ctx) {
        try {
            try {
                const ttl = (url) => {
                    if (url.pathname.startsWith("/build/")) {
                        return 60 * 60 * 24 * 365; // 1 year
                    }
                    return 60 * 5; // 5 minutes
                };

                return await getAssetFromKV(
                    {
                        request,
                        waitUntil: ctx.waitUntil.bind(ctx),
                    },
                    {
                        ASSET_NAMESPACE: env.__STATIC_CONTENT,
                        ASSET_MANIFEST: assetManifest,
                        cacheControl: {
                            browserTTL: ttl,
                            edgeTTL: ttl,
                            bypassCache: false,
                        },
                    }
                );
            } catch (error) {
                if (error instanceof MethodNotAllowedError || error instanceof NotFoundError) {
                    // Fall through to Remix handler
                } else {
                    throw error;
                }
            }

            const handleRequest = createRequestHandler(build, process.env.NODE_ENV);
            const loadContext = { cloudflare: { env, ctx } };
            return await handleRequest(request, loadContext);
        } catch (error) {
            console.error("Worker error:", error);
            return new Response("Internal Server Error", { status: 500 });
        }
    },
};
