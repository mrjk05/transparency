import { json } from "@remix-run/cloudflare";

export const loader = async ({ request, context }) => {
    const { env } = context.cloudflare;
    const url = new URL(request.url);
    const millId = url.searchParams.get("millId");

    if (!millId) {
        return json({ collections: [] });
    }

    console.log(`[API] Fetching collections for millId: ${millId}`);
    try {
        const { results: collections } = await env.DB.prepare(
            "SELECT * FROM fabric_collections WHERE supplier_id = ?"
        ).bind(millId).all();
        console.log(`[API] Found ${collections.length} collections`);
        return json({ collections });
    } catch (error) {
        console.error("[API] Error fetching collections:", error);
        return json({ collections: [], error: error.message });
    }
};
