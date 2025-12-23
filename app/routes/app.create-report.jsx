import { useState, useCallback, useEffect } from "react";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useSubmit, useNavigate, useActionData } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, Button, Text, Banner } from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { verifySessionToken } from "../auth/verifySessionToken.server";
import { TransparencyWizard } from "../components/TransparencyWizard";
import { renderToStream, Document, Page as PdfPage, Text as PdfText, View, StyleSheet } from "@react-pdf/renderer";
import { SCORING_CONFIG } from "../config/scoring";

// --- PDF Styles ---
const styles = StyleSheet.create({
    page: { flexDirection: 'column', backgroundColor: '#FFFFFF', padding: 30 },
    header: { marginBottom: 20, borderBottom: '1px solid #000', paddingBottom: 10 },
    title: { fontSize: 24, marginBottom: 10 },
    subtitle: { fontSize: 12, color: '#666' },
    section: { margin: 10, padding: 10, flexGrow: 1 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
    label: { fontSize: 10, color: '#666' },
    value: { fontSize: 10, fontWeight: 'bold' },
    score: { fontSize: 14, fontWeight: 'bold', marginTop: 10 },
    footer: { position: 'absolute', bottom: 30, left: 30, right: 30, textAlign: 'center', fontSize: 8, color: '#999' },
});

// --- PDF Component ---
const TransparencyPassport = ({ data, scores }) => (
    <Document>
        <PdfPage size="A4" style={styles.page}>
            <View style={styles.header}>
                <PdfText style={styles.title}>Kadwood Transparency Passport</PdfText>
                <PdfText style={styles.subtitle}>Order: {data.shopify_order_id}</PdfText>
                <PdfText style={styles.subtitle}>Item: {data.item_name}</PdfText>
                <PdfText style={styles.subtitle}>Date: {new Date().toLocaleDateString()}</PdfText>
            </View>

            <View style={styles.section}>
                <PdfText style={{ fontSize: 14, marginBottom: 10 }}>Fabric Details</PdfText>
                <PdfText>Mill ID: {data.mill_id}</PdfText>
                <PdfText>Collection ID: {data.collection_id}</PdfText>
            </View>

            <View style={styles.section}>
                <PdfText style={{ fontSize: 14, marginBottom: 10 }}>Sustainability Score</PdfText>

                <View style={styles.scoreRow}>
                    <PdfText>Fibre & Chemistry:</PdfText>
                    <PdfText>{scores.pillar_1} / 25</PdfText>
                </View>
                <View style={styles.scoreRow}>
                    <PdfText>Traceability:</PdfText>
                    <PdfText>{scores.pillar_2} / 25</PdfText>
                </View>
                <View style={styles.scoreRow}>
                    <PdfText>Labour & Governance:</PdfText>
                    <PdfText>{scores.pillar_3} / 25</PdfText>
                </View>
                <View style={styles.scoreRow}>
                    <PdfText>Climate & Circularity:</PdfText>
                    <PdfText>{scores.pillar_4} / 25</PdfText>
                </View>

                <PdfText style={styles.totalScore}>Total Score: {scores.total} / 100</PdfText>
            </View>
        </PdfPage>
    </Document>
);

// --- Loader ---
export const loader = async ({ request, context }) => {
    const { env } = context.cloudflare;
    const isMockMode = env.MOCK_MODE === "true";
    const url = new URL(request.url);
    const orderId = url.searchParams.get('orderId');
    let orderDetails = null;
    let lineItems = [];

    if (!isMockMode) {
        // Verify session token for embedded app
        const auth = await verifySessionToken(request, env.SHOPIFY_API_SECRET);

        if (!auth.ok) {
            return json({ error: `Unauthorized: ${auth.reason}` }, { status: 401 });
        }

        console.log(`[Loader] Authenticated shop: ${auth.shop}, user: ${auth.userId}`);

        // Fetch order details if orderId is provided
        if (orderId) {
            try {
                const sessionToken = url.searchParams.get('id_token');

                if (sessionToken) {
                    // Exchange session token for access token
                    const tokenExchangeResponse = await fetch(`https://${auth.shop}/admin/oauth/access_token`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            client_id: env.SHOPIFY_API_KEY,
                            client_secret: env.SHOPIFY_API_SECRET,
                            grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
                            subject_token: sessionToken,
                            subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
                            requested_token_type: 'urn:shopify:params:oauth:token-type:online-access-token',
                        }),
                    });

                    if (tokenExchangeResponse.ok) {
                        const tokenData = await tokenExchangeResponse.json();
                        const accessToken = tokenData.access_token;

                        // Fetch specific order
                        const query = `
                            query GetOrder($id: ID!) {
                                order(id: $id) {
                                    id
                                    name
                                    customer {
                                        displayName
                                        email
                                    }
                                    fabricSupplier: metafield(namespace: "custom", key: "fabric_supplier") {
                                        value
                                    }
                                    fabricBunch: metafield(namespace: "custom", key: "fabric_bunch") {
                                        value
                                    }
                                    fabricCode: metafield(namespace: "custom", key: "fabric_code") {
                                        value
                                    }
                                    lineItems(first: 50) {
                                        edges {
                                            node {
                                                id
                                                title
                                                quantity
                                                variant {
                                                    id
                                                    title
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        `;

                        const response = await fetch(`https://${auth.shop}/admin/api/2024-01/graphql.json`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-Shopify-Access-Token': accessToken,
                            },
                            body: JSON.stringify({
                                query,
                                variables: { id: orderId }
                            }),
                        });

                        if (response.ok) {
                            const data = await response.json();
                            if (data.data && data.data.order) {
                                orderDetails = data.data.order;
                                lineItems = data.data.order.lineItems.edges.map(edge => ({
                                    id: edge.node.id,
                                    title: edge.node.title,
                                    quantity: edge.node.quantity,
                                    variant: edge.node.variant
                                }));

                                // Log metafields for debugging
                                if (orderDetails) {
                                    console.log(`[Loader] Fetched order ${orderDetails.name}`);
                                    console.log(`[Loader] Raw metafields:`, {
                                        fabricSupplier: orderDetails.fabricSupplier,
                                        fabricBunch: orderDetails.fabricBunch,
                                        fabricCode: orderDetails.fabricCode
                                    });
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('[Loader] Error fetching order:', error);
            }
        }
    }

    // Helper: Fuzzy match collection by name using Levenshtein distance
    function findClosestCollection(collections, searchTerm) {
        if (!searchTerm || !collections.length) return null;

        const searchLower = searchTerm.toLowerCase().trim();

        // 1. Exact match
        const exactMatch = collections.find(c =>
            c.bunch_name.toLowerCase() === searchLower
        );
        if (exactMatch) return exactMatch.id;

        // 2. Contains match
        const containsMatch = collections.find(c =>
            c.bunch_name.toLowerCase().includes(searchLower) ||
            searchLower.includes(c.bunch_name.toLowerCase())
        );
        if (containsMatch) return containsMatch.id;

        // 3. Levenshtein distance for fuzzy matching
        const levenshtein = (a, b) => {
            const matrix = [];
            for (let i = 0; i <= b.length; i++) {
                matrix[i] = [i];
            }
            for (let j = 0; j <= a.length; j++) {
                matrix[0][j] = j;
            }
            for (let i = 1; i <= b.length; i++) {
                for (let j = 1; j <= a.length; j++) {
                    if (b.charAt(i - 1) === a.charAt(j - 1)) {
                        matrix[i][j] = matrix[i - 1][j - 1];
                    } else {
                        matrix[i][j] = Math.min(
                            matrix[i - 1][j - 1] + 1,
                            matrix[i][j - 1] + 1,
                            matrix[i - 1][j] + 1
                        );
                    }
                }
            }
            return matrix[b.length][a.length];
        };

        let closestMatch = null;
        let minDistance = Infinity;

        collections.forEach(c => {
            const distance = levenshtein(searchLower, c.bunch_name.toLowerCase());
            if (distance < minDistance) {
                minDistance = distance;
                closestMatch = c;
            }
        });

        // Only return if distance is reasonable (< 30% of string length)
        if (closestMatch && minDistance < searchLower.length * 0.3) {
            return closestMatch.id;
        }

        return null;
    }

    // Extract metafields from order
    let fabricSupplierName = null;
    let fabricBunch = null;
    let fabricCode = null;
    let autoPopulatedMillId = null;
    let autoPopulatedCollectionId = null;

    if (orderDetails) {
        fabricSupplierName = orderDetails.fabricSupplier?.value || null;
        fabricBunch = orderDetails.fabricBunch?.value || null;
        fabricCode = orderDetails.fabricCode?.value || null;

        console.log(`[Loader] Order metafields:`, { fabricSupplierName, fabricBunch, fabricCode });
    }

    // Fetch suppliers from D1
    const { results: suppliers } = await env.DB.prepare(
        "SELECT * FROM suppliers"
    ).all();

    // Look up mill by name if metafield exists
    if (fabricSupplierName) {
        try {
            const mill = suppliers.find(s =>
                s.type === 'Mill' && s.name.toLowerCase() === fabricSupplierName.toLowerCase()
            );

            if (mill) {
                autoPopulatedMillId = mill.id;
                console.log(`[Loader] Matched mill "${fabricSupplierName}" to ID: ${mill.id}`);

                // If we have a mill and fabric bunch, try to find the collection
                if (fabricBunch) {
                    const { results: millCollections } = await env.DB.prepare(
                        "SELECT * FROM fabric_collections WHERE supplier_id = ?"
                    ).bind(mill.id).all();

                    autoPopulatedCollectionId = findClosestCollection(millCollections, fabricBunch);

                    if (autoPopulatedCollectionId) {
                        const matchedCollection = millCollections.find(c => c.id === autoPopulatedCollectionId);
                        console.log(`[Loader] Fuzzy matched "${fabricBunch}" to collection "${matchedCollection?.bunch_name}" (ID: ${autoPopulatedCollectionId})`);
                    } else {
                        console.log(`[Loader] No close match found for fabric bunch "${fabricBunch}"`);
                    }
                }
            } else {
                console.log(`[Loader] No mill found matching "${fabricSupplierName}"`);
            }
        } catch (error) {
            console.error(`[Loader] Error processing metafields:`, error);
            // Continue execution even if metafield processing fails
        }
    }

    // Check for existing report for this order
    let existingReport = null;
    let existingFormData = null;

    if (orderDetails && orderDetails.name) {
        const report = await env.DB.prepare(
            "SELECT * FROM reports WHERE shopify_order_id = ? ORDER BY created_at DESC LIMIT 1"
        ).bind(orderDetails.name).first();

        if (report) {
            existingReport = report;

            // Fetch answers for this report
            const { results: answers } = await env.DB.prepare(
                "SELECT * FROM report_answers WHERE report_id = ?"
            ).bind(report.id).all();

            // Reconstruct form data from report and answers
            existingFormData = {
                shopify_order_id: report.shopify_order_id,
                customer_name: report.customer_name,
                shopify_line_item_id: report.shopify_line_item_id,
                suit_id: report.suit_id,
                mill_id: report.mill_id ? String(report.mill_id) : "",
                collection_id: report.collection_id ? String(report.collection_id) : "",
                article_code: report.article_code || "",
                composition: report.composition || "",
                item_name: report.item_name || "",
            };

            // Add answers to form data
            answers.forEach(answer => {
                existingFormData[answer.question_id] = answer.answer_value;
            });

            console.log(`[Loader] Found existing report ${report.id} for order ${orderDetails.name}`);
        } else if (autoPopulatedMillId || fabricCode) {
            // No existing report - auto-populate from metafields
            existingFormData = {
                mill_id: autoPopulatedMillId ? String(autoPopulatedMillId) : "",
                collection_id: autoPopulatedCollectionId ? String(autoPopulatedCollectionId) : "",
                article_code: fabricCode || "",
            };

            console.log(`[Loader] Auto-populated from metafields:`, existingFormData);
        }
    }

    return json({
        suppliers,
        isMockMode,
        orderDetails,
        lineItems,
        existingReport,
        existingFormData
    });
};

// --- Action ---
export const action = async ({ request, context }) => {
    const { env } = context.cloudflare;
    const isMockMode = env.MOCK_MODE === "true";

    if (!isMockMode) {
        // Verify session token for embedded app
        const auth = await verifySessionToken(request, env.SHOPIFY_API_SECRET);

        if (!auth.ok) {
            return json({ error: `Unauthorized: ${auth.reason}` }, { status: 401 });
        }
    }

    const formData = await request.formData();
    const intent = formData.get("intent");

    // Handle Report Submission
    if (intent === "submit_report") {
        const rawData = JSON.parse(formData.get("data"));
        const scores = JSON.parse(formData.get("scores"));

        console.log('[Action] Raw Data:', {
            shopify_order_id: rawData.shopify_order_id,
            customer_name: rawData.customer_name,
            item_name: rawData.item_name
        });

        // 1. Generate PDF (Skipped for now, using HTML Preview)
        // const stream = await renderToStream(<TransparencyPassport data={rawData} scores={scores} />);

        // 2. Upload to R2 (Skipped)
        // ...

        // 3. Save to D1
        const reportId = crypto.randomUUID();

        const bindValues = [
            reportId,
            rawData.shopify_order_id || "UNKNOWN",
            rawData.shopify_line_item_id || null,
            rawData.customer_name || null,
            rawData.suit_id || "KAD-UNKNOWN",
            rawData.mill_id || null,
            rawData.collection_id || null,
            rawData.article_code || null,
            rawData.composition || null,
            rawData.item_name || null,
            scores.pillar_1 ?? 0,
            scores.pillar_2 ?? 0,
            scores.pillar_3 ?? 0,
            scores.pillar_4 ?? 0,
            scores.total ?? 0,
            rawData.emissions ? JSON.stringify(rawData.emissions) : null,
            "N/A",
            `/app/passport/${reportId}`
        ];

        console.log("Bind Values:", JSON.stringify(bindValues, null, 2));

        await env.DB.prepare(`
      INSERT INTO reports (
        id, shopify_order_id, shopify_line_item_id, customer_name, suit_id, mill_id, collection_id, article_code, composition, item_name,
        score_fibre, score_traceability, score_labour, score_climate, total_score, emissions,
        pdf_r2_key, pdf_public_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(...bindValues).run();

        // 3.1 Save Answers
        const answersToInsert = [];
        for (const pillar of SCORING_CONFIG) {
            for (const question of pillar.questions) {
                const answerValue = rawData[question.id];
                // Save if there is a value (even if "no" or empty string if that's a valid answer, but usually check truthy or specific values)
                // For checkboxes, value is "yes" or empty.
                if (answerValue !== undefined && answerValue !== null && answerValue !== "") {
                    let points = 0;
                    if (question.type === "checkbox" || question.type === "select") {
                        const option = question.options?.find(o => o.value === answerValue);
                        if (option) points = option.points || 0;
                    } else if (question.type === "dynamic_lookup") {
                        points = answerValue ? 5 : 0;
                    } else if (question.type === "readonly_score") {
                        // For readonly_score, the answerValue IS the points
                        points = parseInt(answerValue, 10) || 0;
                    }

                    answersToInsert.push({
                        report_id: reportId,
                        question_id: question.id,
                        answer_value: String(answerValue),
                        points_awarded: points
                    });
                }
            }
        }

        if (answersToInsert.length > 0) {
            const stmt = env.DB.prepare(`
                INSERT INTO report_answers (report_id, question_id, answer_value, points_awarded)
                VALUES (?, ?, ?, ?)
            `);
            await env.DB.batch(answersToInsert.map(a => stmt.bind(a.report_id, a.question_id, a.answer_value, a.points_awarded)));
        }

        // 4. Update Shopify Order Metafield (Skip in Mock Mode)
        if (!isMockMode && rawData.shopify_order_id_graphql) {
            const response = await admin.graphql(
                `#graphql
        mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              key
              value
            }
            userErrors {
              field
              message
            }
          }
        }`,
                {
                    variables: {
                        metafields: [
                            {
                                ownerId: rawData.shopify_order_id_graphql,
                                namespace: "kadwood_transparency",
                                key: "report_url",
                                value: `https://${env.SHOPIFY_APP_URL}/app/passport/${reportId}`,
                                type: "url",
                            },
                        ],
                    },
                }
            );
        }

        return json({ success: true, reportId, reportUrl: `/app/passport/${reportId}` });
    }

    return json({ error: "Invalid intent" }, { status: 400 });
};

export default function CreateReport() {
    const { suppliers, isMockMode, orderDetails, lineItems, existingFormData } = useLoaderData();
    const actionData = useActionData();
    const submit = useSubmit();
    const navigate = useNavigate();
    const [collections, setCollections] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleFetchCollections = useCallback(async (millId) => {
        try {
            const response = await fetch(`/api/collections?millId=${millId}`);
            if (response.ok) {
                const data = await response.json();
                const collections = data.collections || [];
                setCollections(collections);
                return collections; // Return the collections for TransparencyWizard
            }
        } catch (error) {
            console.error("Error fetching collections:", error);
        }
        return []; // Return empty array on error
    }, []);

    const handleSubmit = useCallback((data, scores) => {
        const formData = new FormData();
        formData.append("intent", "submit_report");
        formData.append("data", JSON.stringify(data));
        formData.append("scores", JSON.stringify(scores));
        submit(formData, { method: "post" });
    }, [submit]);

    // Auto-navigate to passport page after successful submission
    useEffect(() => {
        console.log('[Navigation] actionData:', actionData);
        if (actionData?.reportId) {
            console.log('[Navigation] Navigating to report:', actionData.reportId);
            // Preserve query parameters for embedded app navigation
            const currentParams = new URLSearchParams(window.location.search);
            const targetUrl = `/app/passport/${actionData.reportId}?${currentParams.toString()}`;
            console.log('[Navigation] Target URL:', targetUrl);
            navigate(targetUrl);
        }
    }, [actionData, navigate]);

    return (
        <Page title="Create Transparency Report" backAction={{ content: 'Orders', url: '/app' }}>
            <Layout>
                {actionData?.reportId && (
                    <Layout.Section>
                        <Banner
                            title="Report Created Successfully"
                            tone="success"
                            action={{
                                content: "View Report",
                                onAction: () => navigate(`/app/passport/${actionData.reportId}`)
                            }}
                        >
                            <p>Your transparency report has been created.</p>
                        </Banner>
                    </Layout.Section>
                )}

                <Layout.Section>
                    <TransparencyWizard
                        suppliers={suppliers}
                        lineItems={lineItems || []}
                        orderDetails={orderDetails}
                        initialFormData={existingFormData}
                        onFetchCollections={handleFetchCollections}
                        onSubmit={handleSubmit}
                        isSubmitting={isSubmitting}
                    />
                </Layout.Section>
            </Layout>
        </Page>
    );
}
