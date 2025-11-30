// Coordinates for key locations (Defaults)
export const LOCATIONS = {
    SYDNEY_WAREHOUSE: { lat: -33.8688, lng: 151.2093, name: "Kadwood Atelier, Sydney", country: "Australia" },
    PRODUCTION_CZ: { lat: 49.4719, lng: 17.1128, name: "Prostějov, Czechia", country: "Czechia" },

    // Primary Producers (Approximate Defaults)
    WOOL_AU: { lat: -32.2569, lng: 148.6011, name: "Dubbo, NSW (Wool)", country: "Australia" },
    COTTON_AU: { lat: -30.3251, lng: 149.7835, name: "Narrabri, NSW (Cotton)", country: "Australia" },
    COTTON_IN: { lat: 22.2587, lng: 71.1924, name: "Gujarat, India (Cotton)", country: "India" },
    SILK_IT: { lat: 45.8080, lng: 9.0852, name: "Como, Italy (Silk)", country: "Italy" },
    LINEN_FR: { lat: 49.1829, lng: -0.3707, name: "Normandy, France (Linen)", country: "France" },
};

// Emission Factors (kg CO2e per tonne-km)
// Source: DHL / DEFRA approx
const FACTORS = {
    AIR: 0.60,  // Long haul air freight
    ROAD: 0.10, // Truck
    SUIT_WEIGHT_TONNES: 0.0015 // 1.5kg
};

// Haversine formula to calculate distance in km
export function haversineDistance(location1, location2) {
    const lat1 = location1.lat;
    const lon1 = location1.lng;
    const lat2 = location2.lat;
    const lon2 = location2.lng;

    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

export function getEmissionFactor(distance, mode) {
    // Simple logic: International (long distance) = Air, Domestic = Road
    // Or explicit mode passed in
    if (mode === "Air") return FACTORS.AIR * FACTORS.SUIT_WEIGHT_TONNES;
    if (mode === "Road") return FACTORS.ROAD * FACTORS.SUIT_WEIGHT_TONNES;
    if (mode === "Sea") return 0.05 * FACTORS.SUIT_WEIGHT_TONNES; // Approx for Sea

    // Fallback based on distance if mode not provided
    return (distance > 1000 ? FACTORS.AIR : FACTORS.ROAD) * FACTORS.SUIT_WEIGHT_TONNES;
}

export function calculateRoute(material, supplier, customLocations = {}) {
    // 1. Determine Locations (Use custom if provided, else defaults)

    // Primary Producer
    let defaultPrimary = LOCATIONS.WOOL_AU;
    if (material.toLowerCase().includes("cotton")) defaultPrimary = LOCATIONS.COTTON_AU;
    if (material.toLowerCase().includes("silk")) defaultPrimary = LOCATIONS.SILK_IT;
    if (material.toLowerCase().includes("linen")) defaultPrimary = LOCATIONS.LINEN_FR;

    const primary = customLocations.primary || defaultPrimary;

    // Mill
    const mill = customLocations.mill || {
        lat: supplier.lat || 0,
        lng: supplier.lng || 0,
        name: supplier.mill_location || supplier.country,
        country: supplier.country // Assuming country is in supplier record
    };

    // Production
    const production = customLocations.production || LOCATIONS.PRODUCTION_CZ;

    // Warehouse
    const warehouse = customLocations.warehouse || LOCATIONS.SYDNEY_WAREHOUSE;

    // 2. Define Legs
    const legs = [
        { from: primary, to: mill, label: "Primary Production → Milling" },
        { from: mill, to: production, label: "Milling → Garment Construction" },
        { from: production, to: warehouse, label: "Garment Construction → Ready for Client" }
    ];

    let totalDistance = 0;
    let totalEmissions = 0;
    const legDetails = [];

    for (const leg of legs) {
        const dist = getDistanceFromLatLonInKm(leg.from.lat, leg.from.lng, leg.to.lat, leg.to.lng);

        // Determine Mode: International = Air, Domestic = Road
        // We need country data. If missing, assume International for safety, or check name.
        const fromCountry = leg.from.country || leg.from.name.split(", ").pop();
        const toCountry = leg.to.country || leg.to.name.split(", ").pop();

        const isInternational = fromCountry.trim().toLowerCase() !== toCountry.trim().toLowerCase();
        const mode = isInternational ? "Air" : "Road";
        const factor = isInternational ? FACTORS.AIR : FACTORS.ROAD;

        const emissions = dist * FACTORS.SUIT_WEIGHT_TONNES * factor;

        totalDistance += dist;
        totalEmissions += emissions;

        legDetails.push({
            label: leg.label,
            from: leg.from.name,
            to: leg.to.name,
            distance: Math.round(dist),
            mode: mode,
            emissions: emissions.toFixed(2)
        });
    }

    return {
        locations: { primary, mill, production, warehouse },
        legs: legDetails,
        totalDistance: Math.round(totalDistance),
        emissionsKg: totalEmissions.toFixed(2)
    };
}
