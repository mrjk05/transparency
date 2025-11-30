import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { Page, Layout, Card, Button, BlockStack } from "@shopify/polaris";
import { TransparencyPassportHTML } from "../components/TransparencyPassportHTML";

export const loader = async ({ params, context }) => {
    const { id } = params;
    const { env } = context.cloudflare;

    const report = await env.DB.prepare("SELECT * FROM reports WHERE id = ?").bind(id).first();

    if (!report) {
        throw new Response("Report not found", { status: 404 });
    }

    // Fetch Mill Name if mill_id exists
    let millName = "Unknown";
    if (report.mill_id) {
        const mill = await env.DB.prepare("SELECT name FROM suppliers WHERE id = ?").bind(report.mill_id).first();
        if (mill) millName = mill.name;
    }

    // Fetch Collection Name if collection_id exists
    let collectionName = report.collection_id; // Default to ID if not found (or could be null)
    if (report.collection_id) {
        const collection = await env.DB.prepare("SELECT bunch_name FROM fabric_collections WHERE id = ?").bind(report.collection_id).first();
        if (collection) collectionName = collection.bunch_name;
    }

    // Fetch Answers
    const { results: answers } = await env.DB.prepare("SELECT * FROM report_answers WHERE report_id = ?").bind(id).all();

    return json({ report: { ...report, mill_name: millName, collection_name: collectionName }, answers });
};

export default function PassportPreview() {
    const { report } = useLoaderData();
    const answers = useLoaderData().answers;
    const [isPrinting, setIsPrinting] = useState(false);

    // Reconstruct scores object for the component
    const scores = {
        score_fibre: report.score_fibre,
        score_traceability: report.score_traceability,
        score_labour: report.score_labour,
        score_climate: report.score_climate,
        total_score: report.total_score
    };

    // Prepare data for the passport view
    const data = {
        ...report,
        emissions: report.emissions ? JSON.parse(report.emissions) : null
    };

    const handlePrint = () => {
        setIsPrinting(true);
        // Allow time for render before printing
        setTimeout(() => {
            window.print();
        }, 100);
    };

    // If printing, render ONLY the passport and a close button
    if (isPrinting) {
        return (
            <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: "white", zIndex: 9999 }}>
                <div style={{ padding: "20px", textAlign: "center", background: "#f4f6f8", borderBottom: "1px solid #dfe3e8" }} className="print:hidden">
                    <Button onClick={() => setIsPrinting(false)}>Close Print View</Button>
                    <span style={{ marginLeft: "10px", color: "#637381" }}>Click "Save" in the print dialog to download as PDF.</span>
                </div>
                <div className="passport-container">
                    <TransparencyPassportHTML data={data} scores={scores} answers={answers} />
                </div>
                <style>{`
                    @media print {
                        .print\\:hidden { display: none !important; }
                        body { margin: 0; padding: 0; }
                        @page { margin: 0; size: auto; }
                    }
                `}</style>
            </div>
        );
    }

    return (
        <Page title="Passport Preview" backAction={{ content: "Back", url: "/app/create-report" }}>
            <Layout>
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                                <Button onClick={handlePrint} variant="primary">Print / Save as PDF</Button>
                            </div>
                            <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", overflow: "hidden" }}>
                                <TransparencyPassportHTML data={data} scores={scores} answers={answers} />
                            </div>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
