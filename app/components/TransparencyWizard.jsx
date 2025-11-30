import { useState, useEffect, useCallback } from "react";
import {
    Card,
    Layout,
    BlockStack,
    Text,
    Select,
    Checkbox,
    Button,
    Banner,
    Box,
    InlineStack,
    Divider,
    ProgressBar,
    List,
    TextField,
    Icon,
    Tooltip,
    Combobox,
    Listbox,
    Tag,
    LegacyStack
} from "@shopify/polaris";
import { SearchIcon, InfoIcon, CheckIcon, AlertCircleIcon } from "@shopify/polaris-icons";
import { SCORING_CONFIG } from "../config/scoring";
import { calculateRoute, haversineDistance, getEmissionFactor, LOCATIONS } from "../utils/emissions"; // Assuming haversineDistance and getEmissionFactor are now imported or defined elsewhere

export function TransparencyWizard({
    suppliers = [],
    lineItems = [],
    onFetchCollections,
    onSubmit,
    isSubmitting
}) {
    // State for form data
    const [formData, setFormData] = useState({
        shopify_order_id: "",
        shopify_line_item_id: "",
        suit_id: "",
        mill_id: "",
        collection_id: "",
        article_code: "",
        composition: "",
        item_name: ""
    });
    const [selectedLineItem, setSelectedLineItem] = useState("");
    const [scores, setScores] = useState({
        pillar_1: 0,
        pillar_2: 0,
        pillar_3: 0,
        pillar_4: 0,
        total: 0
    });

    // State for dynamic collections & material
    const [collections, setCollections] = useState([]);
    const [loadingCollections, setLoadingCollections] = useState(false);
    const [material, setMaterial] = useState("Wool"); // Default
    const [emissionsData, setEmissionsData] = useState(null);

    // Custom Locations State
    const [customLocations, setCustomLocations] = useState({
        production: LOCATIONS.PRODUCTION_CZ,
        warehouse: LOCATIONS.SYDNEY_WAREHOUSE
    });
    const [locationInputs, setLocationInputs] = useState({
        primary: "",
        mill: "",
        production: "",
        warehouse: ""
    });
    const [isGeocoding, setIsGeocoding] = useState(false);

    // Material Options for Combobox
    const materialOptions = [
        { label: "Wool (Merino)", value: "Wool" },
        { label: "Silk", value: "Silk" },
        { label: "Linen", value: "Linen" },
        { label: "Cotton", value: "Cotton" },
        { label: "Cashmere", value: "Cashmere" },
        { label: "Mohair", value: "Mohair" },
        { label: "Vicuna", value: "Vicuna" },
        { label: "Elastane", value: "Elastane" },
        { label: "Polyamide", value: "Polyamide" }
    ];

    // Helper to calculate score for a single question
    const calculateQuestionScore = useCallback((question, answer) => {
        if (question.type === "readonly_score") {
            return answer ? parseInt(answer, 10) : 0;
        }

        if (!answer) return 0;

        if (question.type === "checkbox") {
            return answer ? (question.options[0]?.points || 0) : 0;
        }

        if (question.type === "select") {
            const option = question.options.find(opt => opt.value === answer);
            return option ? option.points : 0;
        }

        if (question.type === "dynamic_lookup") {
            return answer ? 5 : 0;
        }

        return 0;
    }, []);

    // Recalculate scores whenever formData changes
    useEffect(() => {
        const newScores = { pillar_1: 0, pillar_2: 0, pillar_3: 0, pillar_4: 0, total: 0 };

        SCORING_CONFIG.forEach(pillar => {
            let pillarScore = 0;
            pillar.questions.forEach(q => {
                const answer = formData[q.id];
                pillarScore += calculateQuestionScore(q, answer);
            });
            // Cap the score at the pillar's maximum
            newScores[pillar.id] = Math.min(pillarScore, pillar.max_score);
        });

        newScores.total = Object.values(newScores).reduce((a, b) => a + b, 0) - newScores.total;
        setScores(newScores);
    }, [formData, calculateQuestionScore]);

    // Handle Mill Selection to fetch collections & pre-fill certs
    const handleMillChange = async (value) => {
        setFormData(prev => ({ ...prev, mill_id: value, collection_id: "" }));

        if (value) {
            // Pre-fill Certifications & Sustainability Data
            const supplier = suppliers.find(s => String(s.id) === value);
            if (supplier) {
                let sustainabilityData = {};
                try {
                    if (supplier.sustainability_data) {
                        sustainabilityData = JSON.parse(supplier.sustainability_data);
                    }
                } catch (e) {
                    console.error("Failed to parse sustainability data", e);
                }

                setFormData(prev => ({
                    ...prev,
                    p1_woolmark: supplier.woolmark_certified ? "yes" : "",
                    p1_rws: supplier.rws_certified ? "yes" : "",
                    ...sustainabilityData
                }));

                // Set custom mill location when mill changes
                setCustomLocations(prev => ({
                    ...prev,
                    mill: {
                        lat: supplier.lat,
                        lng: supplier.lng,
                        name: supplier.mill_location || supplier.country,
                        country: supplier.country
                    }
                }));

                // Also update the input field for immediate feedback
                setLocationInputs(prev => ({
                    ...prev,
                    mill: supplier.mill_location || supplier.country
                }));
            }

            setLoadingCollections(true);
            try {
                const fetchedCollections = await onFetchCollections(value);
                setCollections(fetchedCollections);
            } catch (error) {
                console.error("Failed to fetch collections", error);
            } finally {
                setLoadingCollections(false);
            }
        } else {
            setCollections([]);
        }
    };

    // Geocode Function
    const handleGeocode = async (key, query) => {
        if (!query) return;
        setIsGeocoding(true);
        try {
            const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
            const data = await response.json();

            if (data.error) {
                alert("Location not found. Please try a different search.");
                return;
            }

            setCustomLocations(prev => ({
                ...prev,
                [key]: {
                    lat: data.lat,
                    lng: data.lng,
                    name: data.name,
                    country: data.country
                }
            }));
        } catch (error) {
            console.error("Geocoding failed", error);
            alert("Failed to update location.");
        } finally {
            setIsGeocoding(false);
        }
    };

    // Helper to get primary location for a SINGLE material
    const getPrimaryLocation = (material) => {
        switch (material) {
            case "Wool": return { lat: -33.8688, lng: 151.2093, name: "New South Wales, Australia", country: "Australia" };
            case "Silk": return { lat: 30.2672, lng: 120.1532, name: "Hangzhou, China", country: "China" };
            case "Linen": return { lat: 49.6116, lng: 0.7234, name: "Normandy, France", country: "France" };
            case "Cotton": return { lat: 33.5731, lng: -101.8552, name: "Texas, USA", country: "USA" };
            case "Cashmere": return { lat: 43.8256, lng: 87.6168, name: "Xinjiang, China", country: "China" }; // Or Mongolia
            case "Mohair": return { lat: -33.9249, lng: 18.4241, name: "Western Cape, South Africa", country: "South Africa" };
            case "Vicuna": return { lat: -12.0464, lng: -77.0428, name: "Andes, Peru", country: "Peru" };
            default: return { lat: 41.9028, lng: 12.4964, name: "Unknown Origin", country: "Unknown" };
        }
    };

    // Calculate Emissions with Multi-Leg Support
    const calculateEmissions = useCallback(() => {
        if (!customLocations.mill || !customLocations.production || !customLocations.warehouse) {
            setEmissionsData(null);
            return;
        }

        const legs = [];
        let totalDistance = 0;
        let totalEmissions = 0;

        // 1. Primary Production -> Mill
        const origin = getPrimaryLocation(material);
        const dist1 = haversineDistance(origin, customLocations.mill);
        const emissionFactor = getEmissionFactor(dist1, "Sea"); // Assuming Sea for raw materials
        const emis1 = dist1 * emissionFactor;

        legs.push({
            label: "Primary Production → Milling",
            from: origin.name,
            to: customLocations.mill.name,
            distance: Math.round(dist1),
            mode: "Sea",
            emissions: emis1.toFixed(2)
        });
        totalDistance += dist1;
        totalEmissions += emis1;

        // 2. Milling -> Production
        const dist2 = haversineDistance(customLocations.mill, customLocations.production);
        const emis2 = dist2 * getEmissionFactor(dist2, "Road"); // Intra-Europe usually road
        legs.push({
            label: "Milling → Garment Construction",
            from: customLocations.mill.name,
            to: customLocations.production.name,
            distance: Math.round(dist2),
            mode: "Road",
            emissions: emis2.toFixed(2)
        });
        totalDistance += dist2;
        totalEmissions += emis2;

        // 3. Production -> Warehouse
        const dist3 = haversineDistance(customLocations.production, customLocations.warehouse);
        const emis3 = dist3 * getEmissionFactor(dist3, "Air"); // International shipping usually Air for bespoke
        legs.push({
            label: "Garment Construction → Ready for Client",
            from: customLocations.production.name,
            to: customLocations.warehouse.name,
            distance: Math.round(dist3),
            mode: "Air",
            emissions: emis3.toFixed(2)
        });
        totalDistance += dist3;
        totalEmissions += emis3;

        const newEmissionsData = {
            locations: {
                primary: [{ ...origin, material }],
                mill: customLocations.mill,
                production: customLocations.production,
                warehouse: customLocations.warehouse
            },
            legs,
            totalDistance: Math.round(totalDistance),
            emissionsKg: totalEmissions.toFixed(2)
        };
        setEmissionsData(newEmissionsData);

        // Calculate Score based on distance (Example logic)
        // < 15000km = 5 pts, < 20000km = 2 pts, else 0
        let score = 0;
        if (newEmissionsData.totalDistance < 15000) score = 5;
        else if (newEmissionsData.totalDistance < 20000) score = 2;

        setFormData(prev => ({ ...prev, p4_co2_score: score }));

    }, [customLocations, material]);

    // Trigger emissions calculation when relevant dependencies change
    useEffect(() => {
        calculateEmissions();
    }, [calculateEmissions]);

    // Sync location inputs with calculated locations if not already set by user
    // Sync location inputs with calculated locations if not already set by user
    useEffect(() => {
        if (emissionsData) {
            setLocationInputs(prev => ({
                // Always update primary if it comes from the default map (material change)
                // But we want to allow manual edits.
                // Strategy: If the material changes, we should probably reset the input to the new default.
                // However, we don't have 'material' in this dependency array easily without causing loops.
                // Better approach: Update locationInputs in the same place we update 'material'.

                // For now, let's keep the others as "fill if empty"
                primary: prev.primary,
                mill: prev.mill || (customLocations.mill ? customLocations.mill.name : emissionsData.locations.mill?.name) || "",
                production: prev.production || (customLocations.production ? customLocations.production.name : emissionsData.locations.production?.name) || "",
                warehouse: prev.warehouse || (customLocations.warehouse ? customLocations.warehouse.name : emissionsData.locations.warehouse?.name) || ""
            }));
        }
    }, [emissionsData, customLocations]);

    // When material changes, update the primary input
    useEffect(() => {
        const origin = getPrimaryLocation(material);
        if (origin) {
            setLocationInputs(prev => ({ ...prev, primary: origin.name }));
        }
    }, [material]);


    const handleInputChange = (key, value) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const handleSubmit = () => {
        // Include emissions data in submission if needed, or just scores
        onSubmit({ ...formData, emissions: emissionsData, composition: material }, scores);
    };

    const millOptions = [{ label: "Select a Mill", value: "" }, ...suppliers.filter(s => s.type === 'Mill').map(s => ({ label: s.name, value: String(s.id) }))];
    const atelierOptions = [{ label: "Select an Atelier", value: "" }, ...suppliers.filter(s => s.type === 'Atelier').map(s => ({ label: s.name, value: String(s.id) }))];
    const collectionOptions = [{ label: "Select a Collection", value: "" }, ...collections.map(c => ({ label: c.bunch_name, value: String(c.id) }))];

    return (
        <BlockStack gap="500">
            {/* Score Dashboard */}
            <Card>
                <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Live Scorecard</Text>
                    <InlineStack gap="400" align="space-between">
                        <ScoreIndicator label="Fibre" score={scores.pillar_1} max={25} />
                        <ScoreIndicator label="Traceability" score={scores.pillar_2} max={25} />
                        <ScoreIndicator label="Labour" score={scores.pillar_3} max={25} />
                        <ScoreIndicator label="Climate" score={scores.pillar_4} max={25} />
                    </InlineStack>
                    <Divider />
                    <InlineStack align="space-between">
                        <Text variant="headingLg" as="h3">Total Score</Text>
                        <Text variant="headingLg" as="h3" tone={scores.total >= 80 ? "success" : scores.total >= 50 ? "warning" : "critical"}>
                            {scores.total} / 100
                        </Text>
                    </InlineStack>
                </BlockStack>
            </Card>

            {/* Basic Info */}
            <Card>
                <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Order Details</Text>
                    <Select
                        label="Select Item from Order"
                        options={[{ label: "Select an item...", value: "" }, ...lineItems.map(item => ({ label: item.title, value: item.id }))]}
                        onChange={(val) => {
                            setSelectedLineItem(val);
                            const item = lineItems.find(i => i.id === val);
                            handleInputChange("item_name", item ? item.title : "");
                            handleInputChange("shopify_line_item_id", val);
                        }}
                        value={selectedLineItem}
                    />
                    <Divider />
                    <Text variant="headingMd" as="h2">Fabric Details</Text>
                    <Select
                        label="Material Composition"
                        options={[
                            { label: "Wool (Merino)", value: "Wool" },
                            { label: "Cotton", value: "Cotton" },
                            { label: "Silk", value: "Silk" },
                            { label: "Linen", value: "Linen" },
                            { label: "Blend", value: "Blend" }
                        ]}
                        onChange={setMaterial}
                        value={material}
                    />
                    <Select
                        label="Fabric Mill"
                        options={millOptions}
                        onChange={handleMillChange}
                        value={formData.mill_id}
                        disabled={!selectedLineItem}
                    />
                    <Select
                        label="Collection (Bunch)"
                        options={collectionOptions}
                        onChange={(val) => handleInputChange("collection_id", val)}
                        value={formData.collection_id}
                        disabled={!formData.mill_id || loadingCollections}
                    />
                    <Text as="p" tone="subdued">
                        {loadingCollections ? "Loading collections..." : `${collections.length} collections loaded. First: ${collections[0]?.bunch_name || "N/A"}`}
                    </Text>
                    <TextField
                        label="Article Code"
                        value={formData.article_code}
                        onChange={(val) => handleInputChange("article_code", val)}
                        placeholder="e.g., 880001"
                        autoComplete="off"
                        helpText="Input the specific fabric code from the bunch."
                    />
                </BlockStack>
            </Card>

            {/* Pillars */}
            {SCORING_CONFIG.map((pillar) => (
                <Card key={pillar.id}>
                    <BlockStack gap="400">
                        <InlineStack gap="200" align="start" blockAlign="center">
                            <Text variant="headingMd" as="h2">{pillar.title}</Text>
                            <Tooltip content={pillar.description} dismissOnMouseOut>
                                <Icon source={InfoIcon} tone="base" />
                            </Tooltip>
                        </InlineStack>

                        {/* Special Rendering for Climate Pillar CO2 */}
                        {pillar.id === "pillar_4" && emissionsData && (
                            <Box paddingBlockEnd="400">
                                <BlockStack gap="400">
                                    <Text variant="headingSm" as="h3">Supply Chain Journey (Editable)</Text>

                                    <LocationInput
                                        label="1. Primary Production"
                                        value={locationInputs.primary}
                                        onChange={(v) => setLocationInputs(prev => ({ ...prev, primary: v }))}
                                        onSearch={() => handleGeocode("primary", locationInputs.primary)}
                                        loading={isGeocoding}
                                    />
                                    <LocationInput
                                        label="2. Milling"
                                        value={locationInputs.mill}
                                        onChange={(v) => setLocationInputs(prev => ({ ...prev, mill: v }))}
                                        onSearch={() => handleGeocode("mill", locationInputs.mill)}
                                        loading={isGeocoding}
                                    />
                                    <LocationInput
                                        label="3. Garment Construction"
                                        value={locationInputs.production}
                                        onChange={(v) => setLocationInputs(prev => ({ ...prev, production: v }))}
                                        onSearch={() => handleGeocode("production", locationInputs.production)}
                                        loading={isGeocoding}
                                    />
                                    <LocationInput
                                        label="4. Ready for Client"
                                        value={locationInputs.warehouse}
                                        onChange={(v) => setLocationInputs(prev => ({ ...prev, warehouse: v }))}
                                        onSearch={() => handleGeocode("warehouse", locationInputs.warehouse)}
                                        loading={isGeocoding}
                                    />

                                    <Divider />
                                    <BlockStack gap="200">
                                        <Text fontWeight="bold">Route Summary:</Text>
                                        <List type="number">
                                            {emissionsData.legs.map((leg, i) => (
                                                <List.Item key={i}>
                                                    <Text fontWeight="bold" variant="bodySm">{leg.label}</Text>
                                                    <Text variant="bodyMd">{leg.from} → {leg.to}</Text>
                                                    <Text tone="subdued" variant="bodySm">
                                                        {leg.distance} km via {leg.mode} ({leg.emissions} kg CO2e)
                                                    </Text>
                                                </List.Item>
                                            ))}
                                        </List>
                                        <Text fontWeight="bold" variant="headingMd">Total Distance: {emissionsData.totalDistance} km</Text>
                                        <Text fontWeight="bold" variant="headingMd" tone="critical">Est. Emissions: {emissionsData.emissionsKg} kg CO2e</Text>
                                    </BlockStack>
                                </BlockStack>
                            </Box>
                        )}

                        {pillar.questions.map((q) => (
                            <Box key={q.id} paddingBlockEnd="200">
                                {renderQuestion(q, formData, handleInputChange, { millOptions, atelierOptions })}
                            </Box>
                        ))}
                    </BlockStack>
                </Card>
            ))}

            <Box paddingBlockStart="400">
                <Button
                    variant="primary"
                    size="large"
                    onClick={handleSubmit}
                    loading={isSubmitting}
                    disabled={!selectedLineItem}
                >
                    Generate Transparency Passport
                </Button>
            </Box>
        </BlockStack>
    );
}

function LocationInput({ label, value, onChange, onSearch, loading }) {
    return (
        <InlineStack gap="200" align="start" blockAlign="end">
            <Box width="100%">
                <TextField
                    label={label}
                    value={value}
                    onChange={onChange}
                    autoComplete="off"
                    connectedRight={
                        <Button icon={SearchIcon} onClick={onSearch} loading={loading} accessibilityLabel="Update Location" />
                    }
                />
            </Box>
        </InlineStack>
    );
}

function ScoreIndicator({ label, score, max }) {
    const percentage = (score / max) * 100;
    return (
        <Box width="20%">
            <BlockStack gap="200">
                <Text variant="bodySm" as="p">{label}</Text>
                <ProgressBar progress={percentage} size="small" tone={percentage > 70 ? "success" : "highlight"} />
                <Text variant="bodySm" as="p" tone="subdued">{score}/{max}</Text>
            </BlockStack>
        </Box>
    );
}

function renderQuestion(q, formData, onChange, { millOptions, atelierOptions }) {
    // Validation Logic: If mill is selected but answer is empty, show error
    const isInvalid = formData.mill_id && (!formData[q.id] || formData[q.id] === "");
    const error = isInvalid ? true : undefined; // Polaris uses boolean or string for error

    if (q.type === "readonly_score") {
        return null;
    }

    if (q.type === "dynamic_lookup") {
        const options = q.lookup_type === "Mill" ? millOptions : atelierOptions;
        return (
            <Select
                label={q.label}
                options={options}
                onChange={(val) => onChange(q.id, val)}
                value={formData[q.id]}
                error={error}
            />
        );
    }

    if (q.type === "select") {
        return (
            <Select
                label={q.label}
                options={[{ label: "Select...", value: "" }, ...q.options]}
                onChange={(val) => onChange(q.id, val)}
                value={formData[q.id]}
                error={error}
            />
        );
    }

    if (q.type === "checkbox") {
        return (
            <BlockStack gap="100">
                <Text fontWeight="bold">{q.label}</Text>
                <Checkbox
                    label={q.options[0].label}
                    checked={formData[q.id] === q.options[0].value}
                    onChange={(newChecked) => onChange(q.id, newChecked ? q.options[0].value : "")}
                    error={error}
                />
            </BlockStack>
        );
    }

    return null;
}
