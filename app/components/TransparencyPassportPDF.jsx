import React from 'react';
import { SCORING_CONFIG } from "../config/scoring";

export const createPassportPDF = (ReactPDF) => {
    const { Document, Page, Text, View, StyleSheet, Font } = ReactPDF;

    // Register fonts
    try {
        Font.register({
            family: 'Helvetica',
            fonts: [
                { src: 'https://fonts.gstatic.com/s/helveticaneue/v1/1.ttf' }, // Fallback or standard font
                { src: 'https://fonts.gstatic.com/s/helveticaneue/v1/2.ttf', fontWeight: 700 },
            ]
        });
    } catch (e) {
        // Ignore if already registered
        console.warn("Font registration failed or already registered", e);
    }

    const styles = StyleSheet.create({
        page: {
            padding: 40,
            fontFamily: 'Helvetica',
            backgroundColor: '#ffffff',
            border: '8px solid #42141E',
        },
        header: {
            marginBottom: 20,
            textAlign: 'center',
        },
        logo: {
            width: 100,
            height: 'auto',
            marginBottom: 10,
            alignSelf: 'center',
        },
        title: {
            fontSize: 16,
            textTransform: 'uppercase',
            letterSpacing: 2,
            color: '#42141E',
            fontWeight: 'bold',
        },
        introText: {
            fontSize: 10,
            color: '#666',
            textAlign: 'center',
            marginBottom: 30,
            lineHeight: 1.5,
            paddingHorizontal: 40,
        },
        grid4: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: 30,
        },
        gridItem: {
            width: '23%',
        },
        label: {
            fontSize: 8,
            color: '#666',
            textTransform: 'uppercase',
            marginBottom: 2,
        },
        value: {
            fontSize: 12,
            fontWeight: 'bold',
            color: '#000',
        },
        sectionTitle: {
            fontSize: 12,
            fontWeight: 'bold',
            textTransform: 'uppercase',
            letterSpacing: 1,
            color: '#42141E',
            borderBottom: '1px solid #eee',
            paddingBottom: 5,
            marginBottom: 15,
            marginTop: 10,
        },
        scoreGrid: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: 20,
        },
        scoreColumn: {
            width: '48%',
        },
        scoreRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: 4,
        },
        scoreLabel: {
            fontSize: 10,
            color: '#000',
        },
        scoreValue: {
            fontSize: 10,
            fontWeight: 'bold',
            color: '#42141E',
        },
        progressBarBg: {
            height: 4,
            backgroundColor: '#eee',
            marginBottom: 10,
        },
        progressBarFill: {
            height: '100%',
            backgroundColor: '#42141E',
        },
        totalScoreBox: {
            backgroundColor: '#f9f9f9',
            padding: 20,
            textAlign: 'center',
            marginTop: 10,
            marginBottom: 20,
            border: '1px solid #eee',
        },
        totalScoreLabel: {
            fontSize: 8,
            textTransform: 'uppercase',
            color: '#666',
            marginBottom: 5,
            textAlign: 'center',
        },
        totalScoreValue: {
            fontSize: 36,
            fontWeight: 'light',
            color: '#42141E',
            textAlign: 'center',
        },
        totalScoreSub: {
            fontSize: 8,
            color: '#999',
            marginTop: 5,
            textAlign: 'center',
        },
        disclaimer: {
            fontSize: 8,
            color: '#666',
            fontStyle: 'italic',
            textAlign: 'center',
            marginTop: 10,
            paddingHorizontal: 20,
        },
        journeyStep: {
            marginBottom: 10,
            paddingLeft: 15,
            borderLeft: '1px solid #eee',
            position: 'relative',
        },
        journeyDot: {
            position: 'absolute',
            left: -3,
            top: 2,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: '#42141E',
        },
        journeyLabel: {
            fontSize: 9,
            fontWeight: 'bold',
            textTransform: 'uppercase',
            color: '#42141E',
            marginBottom: 2,
        },
        journeyText: {
            fontSize: 10,
            marginBottom: 2,
        },
        journeySub: {
            fontSize: 9,
            color: '#999',
        },
        journeySummary: {
            marginTop: 15,
            padding: 10,
            backgroundColor: '#f9f9f9',
            flexDirection: 'row',
            justifyContent: 'space-between',
        },
        footer: {
            marginTop: 30,
            paddingTop: 10,
            borderTop: '1px solid #eee',
            textAlign: 'center',
        },
        footerText: {
            fontSize: 8,
            color: '#999',
            marginBottom: 5,
            textAlign: 'center',
        },
        table: {
            width: '100%',
            marginTop: 10,
        },
        tableRow: {
            flexDirection: 'row',
            borderBottom: '1px solid #f9f9f9',
            paddingVertical: 4,
        },
        tableHeader: {
            borderBottom: '1px solid #eee',
            marginBottom: 5,
        },
        col1: { width: '50%', fontSize: 9 },
        col2: { width: '40%', fontSize: 9 },
        col3: { width: '10%', fontSize: 9, textAlign: 'right' },
        bold: { fontWeight: 'bold', color: '#42141E' },
    });

    const getAnswerText = (question, answerValue) => {
        if (!answerValue) return "N/A";
        if (question.type === "checkbox") return answerValue === "yes" ? "Yes" : "No";
        if (question.type === "select") {
            const option = question.options.find(o => o.value === answerValue);
            return option ? option.label : answerValue;
        }
        if (question.type === "dynamic_lookup") {
            return answerValue ? "Verified" : "Not Verified";
        }
        return answerValue;
    };

    const formatDate = (dateString) => {
        if (!dateString) return new Date().toLocaleDateString();
        return new Date(dateString).toLocaleDateString();
    };

    return ({ data, scores, answers }) => (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>Transparency Passport</Text>
                </View>

                <Text style={styles.introText}>
                    This Transparency Passport serves as a comprehensive record of your garment's journey.
                    It verifies the sustainability credentials, traces the supply chain from raw material to final production,
                    and quantifies the environmental impact, ensuring complete accountability and peace of mind.
                </Text>

                {/* Product Info */}
                <View style={styles.grid4}>
                    <View style={styles.gridItem}>
                        <Text style={styles.label}>Order Reference</Text>
                        <Text style={styles.value}>{data.shopify_order_id || "N/A"}</Text>
                    </View>
                    <View style={styles.gridItem}>
                        <Text style={styles.label}>Item / Composition</Text>
                        <Text style={styles.value}>{data.item_name || "Custom Garment"}</Text>
                        <Text style={{ fontSize: 9 }}>{data.composition || "Wool"}</Text>
                    </View>
                    <View style={styles.gridItem}>
                        <Text style={styles.label}>Fabric Mill</Text>
                        <Text style={styles.value}>{data.mill_name || data.mill_id || "Unknown"}</Text>
                    </View>
                    <View style={styles.gridItem}>
                        <Text style={styles.label}>Collection / Article</Text>
                        <Text style={styles.value}>{data.collection_name || data.collection_id || "N/A"}</Text>
                        <Text style={{ fontSize: 9 }}>{data.article_code || "N/A"}</Text>
                    </View>
                </View>

                {/* Scorecard */}
                <Text style={styles.sectionTitle}>Sustainability Scorecard</Text>
                <View style={styles.scoreGrid}>
                    <View style={styles.scoreColumn}>
                        <View style={styles.scoreRow}>
                            <Text style={styles.scoreLabel}>Fibre & Material Health</Text>
                            <Text style={styles.scoreValue}>{scores.score_fibre} / 25</Text>
                        </View>
                        <View style={styles.progressBarBg}>
                            <View style={[styles.progressBarFill, { width: `${(scores.score_fibre / 25) * 100}%` }]} />
                        </View>

                        <View style={styles.scoreRow}>
                            <Text style={styles.scoreLabel}>Traceability</Text>
                            <Text style={styles.scoreValue}>{scores.score_traceability} / 25</Text>
                        </View>
                        <View style={styles.progressBarBg}>
                            <View style={[styles.progressBarFill, { width: `${(scores.score_traceability / 25) * 100}%` }]} />
                        </View>
                    </View>

                    <View style={styles.scoreColumn}>
                        <View style={styles.scoreRow}>
                            <Text style={styles.scoreLabel}>Social Responsibility</Text>
                            <Text style={styles.scoreValue}>{scores.score_labour} / 25</Text>
                        </View>
                        <View style={styles.progressBarBg}>
                            <View style={[styles.progressBarFill, { width: `${(scores.score_labour / 25) * 100}%` }]} />
                        </View>

                        <View style={styles.scoreRow}>
                            <Text style={styles.scoreLabel}>Climate & Circularity</Text>
                            <Text style={styles.scoreValue}>{scores.score_climate} / 25</Text>
                        </View>
                        <View style={styles.progressBarBg}>
                            <View style={[styles.progressBarFill, { width: `${(scores.score_climate / 25) * 100}%` }]} />
                        </View>
                    </View>
                </View>

                <View style={styles.totalScoreBox}>
                    <Text style={styles.totalScoreLabel}>Total Impact Score</Text>
                    <Text style={styles.totalScoreValue}>{scores.total_score}</Text>
                    <Text style={styles.totalScoreSub}>out of 100</Text>
                    <Text style={styles.disclaimer}>
                        * This score reflects our current visibility into the supply chain. A lower score does not necessarily indicate poor performance, but rather highlights areas where we are actively working to gain more data and transparency.
                    </Text>
                </View>

                {/* Supply Chain Journey */}
                {data.emissions && data.emissions.legs && (
                    <View>
                        <Text style={styles.sectionTitle}>Supply Chain Journey</Text>
                        <View style={{ marginLeft: 10 }}>
                            {data.emissions.legs.map((leg, i) => (
                                <View key={i} style={styles.journeyStep}>
                                    {/* Dot simulation */}
                                    <View style={styles.journeyDot} />
                                    <Text style={styles.journeyLabel}>{leg.label}</Text>
                                    <Text style={styles.journeyText}>{leg.from} → {leg.to}</Text>
                                    <Text style={styles.journeySub}>{leg.distance} km via {leg.mode}</Text>
                                </View>
                            ))}
                        </View>
                        <View style={styles.journeySummary}>
                            <Text style={{ fontSize: 10, fontWeight: 'bold' }}>Total Distance: {data.emissions.totalDistance} km</Text>
                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#42141E' }}>Est. Emissions: {data.emissions.emissionsKg} kg CO2e</Text>
                        </View>
                    </View>
                )}

                {/* Footer Disclaimer */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>Generated on {formatDate(data.created_at)} • Kadwood Transparency Engine</Text>
                    <Text style={[styles.footerText, { fontStyle: 'italic', marginTop: 5 }]}>
                        Disclaimer: This report is generated based on the information available at the time of production.
                        While Kadwood strives for accuracy, supply chain data is dynamic and subject to change.
                        This document does not constitute a legal guarantee or liability.
                    </Text>
                </View>
            </Page>

            {/* Detailed Breakdown Page */}
            {answers && answers.length > 0 && (
                <Page size="A4" style={styles.page}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Sustainability Details</Text>
                    </View>

                    {SCORING_CONFIG.map(pillar => (
                        <View key={pillar.id} style={{ marginBottom: 20 }}>
                            <Text style={styles.sectionTitle}>{pillar.title}</Text>
                            <Text style={{ fontSize: 9, color: '#666', marginBottom: 10 }}>{pillar.description}</Text>

                            <View style={styles.table}>
                                <View style={[styles.tableRow, styles.tableHeader]}>
                                    <Text style={[styles.col1, styles.bold]}>Criteria</Text>
                                    <Text style={[styles.col2, styles.bold]}>Status</Text>
                                    <Text style={[styles.col3, styles.bold]}>Points</Text>
                                </View>
                                {pillar.questions.map(q => {
                                    const ans = answers.find(a => a.question_id === q.id);
                                    return (
                                        <View key={q.id} style={styles.tableRow}>
                                            <Text style={styles.col1}>{q.label}</Text>
                                            <Text style={styles.col2}>{ans ? getAnswerText(q, ans.answer_value) : "-"}</Text>
                                            <Text style={styles.col3}>{ans ? ans.points_awarded : 0}</Text>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    ))}
                </Page>
            )}
        </Document>
    );
};
