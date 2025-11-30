import { json } from "@remix-run/cloudflare";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, Button, Text } from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { initShopify } from "../shopify.server";
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
    let admin = null;

    if (!isMockMode) {
        const shopify = initShopify(env);
        const auth = await shopify.authenticate.admin(request);
        admin = auth.admin;
    }

    // Fetch suppliers from D1
    const { results: suppliers } = await env.DB.prepare(
        "SELECT * FROM suppliers"
    ).all();

    return json({ suppliers, isMockMode });
};

// --- Action ---
export const action = async ({ request, context }) => {
    const { env } = context.cloudflare;
    const isMockMode = env.MOCK_MODE === "true";
    let admin = null;

    if (!isMockMode) {
        const shopify = initShopify(env);
        const auth = await shopify.authenticate.admin(request);
        admin = auth.admin;
    }

    const formData = await request.formData();
    const intent = formData.get("intent");

    // Handle Report Submission
    if (intent === "submit_report") {
        const rawData = JSON.parse(formData.get("data"));
        const scores = JSON.parse(formData.get("scores"));

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
        id, shopify_order_id, shopify_line_item_id, suit_id, mill_id, collection_id, article_code, composition, item_name,
        score_fibre, score_traceability, score_labour, score_climate, total_score, emissions,
        pdf_r2_key, pdf_public_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(...bindValues).run();

        // 3.1 Save Answers
        const answersToInsert = [];
        for (const pillar of SCORING_CONFIG) {
            for (const question of pillar.questions) {
                const answerValue = rawData[question.id];
                // Save if there is a value (even if "no" or empty string if that's a valid answer, but usually check truthy or specific values)
                // For checkboxes, value is "yes" or empty.
                if (answerValue) {
                    let points = 0;
                    if (question.type === "checkbox" || question.type === "select") {
                        const option = question.options?.find(o => o.value === answerValue);
                        if (option) points = option.points || 0;
                    } else if (question.type === "dynamic_lookup") {
                        points = answerValue ? 5 : 0;
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

        return json({ success: true, reportUrl: `/app/passport/${reportId}` });
    }

    return json({ error: "Invalid intent" }, { status: 400 });
};

export default function CreateReport() {
    const { suppliers } = useLoaderData();
    const submit = useSubmit();
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting";

    // Mock line items for demonstration - in real app, these come from the selected order resource
    const mockLineItems = [
        { id: "gid://shopify/LineItem/123456789", title: "The Australian Suit: 2 Piece Edition" },
        { id: "gid://shopify/LineItem/987654321", title: "Extra Trousers" }
    ];

    const handleFetchCollections = async (millId) => {
        console.log(`[Client] Fetching collections for millId: ${millId} from /api/collections`);
        try {
            const response = await fetch(`/api/collections?millId=${millId}`);

            if (!response.ok) {
                console.error(`[Client] Fetch failed with status: ${response.status}`);
                const text = await response.text();
                console.error(`[Client] Response text: ${text}`);
                return [];
            }

            const result = await response.json();
            console.log(`[Client] Received collections:`, result.collections);
            return result.collections || [];
        } catch (error) {
            console.error("[Client] Fetch error:", error);
            return [];
        }
    };

    const handleSubmit = (data, scores) => {
        const formData = new FormData();
        formData.append("intent", "submit_report");
        formData.append("data", JSON.stringify(data));
        formData.append("scores", JSON.stringify(scores));
        submit(formData, { method: "post" });
    };

    return (
        <Page title="Create Transparency Report">
            <TitleBar title="Create Transparency Report" />
            <Layout>
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="p">
                                Select an order and complete the questionnaire to generate a transparency passport.
                            </Text>
                            {/* In a real app, we'd have an Order Picker here first */}
                            <TransparencyWizard
                                suppliers={suppliers}
                                lineItems={mockLineItems}
                                onFetchCollections={handleFetchCollections}
                                onSubmit={handleSubmit}
                                isSubmitting={isSubmitting}
                            />
                        </BlockStack >
                    </Card >
                </Layout.Section >
            </Layout >
        </Page >
    );
}
