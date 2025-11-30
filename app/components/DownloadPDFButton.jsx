import React, { useState, useEffect } from 'react';
import { Button } from "@shopify/polaris";

export function DownloadPDFButton({ data, scores, answers, fileName }) {
    const [PDFLibrary, setPDFLibrary] = useState(null);
    const [PassportPDF, setPassportPDF] = useState(null);

    useEffect(() => {
        // Dynamically import the library and component only on the client side
        const loadLibrary = async () => {
            try {
                // Polyfills for browser environment
                if (typeof window !== 'undefined') {
                    window.global = window;
                    window.process = { env: {} };
                    const bufferModule = await import('buffer');
                    window.Buffer = bufferModule.Buffer;
                }

                const pdfModule = await import("@react-pdf/renderer");
                const { createPassportPDF } = await import("./TransparencyPassportPDF");

                // Create the component using the library instance
                const PassportPDFComponent = createPassportPDF(pdfModule);

                setPDFLibrary(pdfModule);
                setPassportPDF(() => PassportPDFComponent);
            } catch (error) {
                console.error("Failed to load PDF library", error);
            }
        };

        loadLibrary();
    }, []);

    if (!PDFLibrary || !PassportPDF) {
        return <Button disabled>Loading PDF...</Button>;
    }

    const { PDFDownloadLink } = PDFLibrary;

    return (
        <PDFDownloadLink
            document={<PassportPDF data={data} scores={scores} answers={answers} />}
            fileName={fileName}
        >
            {({ blob, url, loading, error }) =>
                <Button variant="primary" loading={loading}>
                    {loading ? 'Generating PDF...' : 'Download PDF'}
                </Button>
            }
        </PDFDownloadLink>
    );
}
