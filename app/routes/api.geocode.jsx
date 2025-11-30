import { json } from "@remix-run/cloudflare";

export const loader = async ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get("q");

    if (!query) {
        return json({ error: "Query parameter 'q' is required" }, { status: 400 });
    }

    try {
        // Use OpenStreetMap Nominatim API
        // Requirement: Must send a valid User-Agent
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;

        const response = await fetch(nominatimUrl, {
            headers: {
                "User-Agent": "KadwoodTransparencyApp/1.0 (jins@example.com)" // Replace with real contact if needed
            }
        });

        if (!response.ok) {
            throw new Error("Failed to fetch from Nominatim");
        }

        const data = await response.json();

        if (data && data.length > 0) {
            const result = data[0];
            // Extract country from display_name if possible, or just return what we have
            // Nominatim returns 'display_name', 'lat', 'lon'
            return json({
                name: result.display_name,
                lat: parseFloat(result.lat),
                lng: parseFloat(result.lon),
                // Simple heuristic for country: last part of display_name
                country: result.display_name.split(", ").pop()
            });
        } else {
            return json({ error: "Location not found" }, { status: 404 });
        }

    } catch (error) {
        console.error("Geocoding error:", error);
        return json({ error: "Geocoding failed" }, { status: 500 });
    }
};
