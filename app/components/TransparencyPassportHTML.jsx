import React from "react";
import { SCORING_CONFIG } from "../config/scoring";

export function TransparencyPassportHTML({ data, scores, answers }) {
    const formatDate = (dateString) => {
        if (!dateString) return new Date().toLocaleDateString();
        return new Date(dateString).toLocaleDateString();
    };

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

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
                
                /* Screen Styles */
                body {
                    background-color: #f4f4f4;
                    margin: 0;
                    padding: 20px;
                    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                    -webkit-print-color-adjust: exact;
                }

                /* Shared Styles */
                .brand-color { color: #42141E; }
                .brand-bg { background-color: #42141E; }
                .text-uppercase { text-transform: uppercase; letter-spacing: 1px; }
                
                .header { text-align: center; margin-bottom: 20px; }
                .logo { max-width: 120px; margin-bottom: 10px; }
                
                .intro-text {
                    text-align: center;
                    font-size: 11px;
                    color: #666;
                    margin-bottom: 25px;
                    line-height: 1.4;
                    max-width: 90%;
                    margin-left: auto;
                    margin-right: auto;
                }

                .section-title {
                    font-size: 13px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: #42141E;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 4px;
                    margin-bottom: 12px;
                    margin-top: 25px;
                }

                .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                .grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; }

                .info-label { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
                .info-value { font-size: 12px; font-weight: 600; }

                .score-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
                .score-bar-bg { width: 100%; height: 4px; background-color: #eee; margin-bottom: 12px; }
                .score-bar-fill { height: 100%; background-color: #42141E; }

                .total-score-box {
                    background-color: #f9f9f9;
                    border: 1px solid #eee;
                    padding: 15px;
                    text-align: center;
                    margin-top: 25px;
                }

                .journey-step {
                    position: relative;
                    padding-left: 15px;
                    margin-bottom: 10px;
                    border-left: 1px solid #eee;
                }
                .journey-dot {
                    position: absolute;
                    left: -3.5px;
                    top: 4px;
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background-color: #42141E;
                }

                .footer {
                    margin-top: 40px;
                    padding-top: 15px;
                    border-top: 1px solid #eee;
                    font-size: 8px;
                    color: #999;
                    text-align: center;
                    line-height: 1.3;
                }

                /* Screen-only container */
                @media screen {
                    .passport-screen-container {
                        width: 210mm;
                        min-height: 297mm;
                        margin: 0 auto;
                        background-color: #fff;
                        padding: 40px;
                        box-sizing: border-box;
                        border: 8px solid #42141E;
                        box-shadow: 0 0 10px rgba(0,0,0,0.1);
                        position: relative;
                        color: #1a1a1a;
                    }
                }

                /* PRINT STYLES - The Robust "Page Wrapper" Strategy */
                @media print {
                    @page { margin: 0; size: A4; }
                    
                    html, body {
                        margin: 0;
                        padding: 0;
                        width: 210mm;
                        height: 297mm;
                        background-color: white;
                    }

                    /* 1. The Outer Page Wrapper: Exactly A4 */
                    .print-page-wrapper {
                        width: 210mm;
                        height: 297mm;
                        position: relative;
                        overflow: hidden;
                        margin: 0;
                        padding: 0;
                        page-break-after: always; /* Force break after each wrapper */
                        background-color: white;
                    }

                    /* 2. The Inner Border Container: Inset by 6mm */
                    .print-border-container {
                        position: absolute;
                        top: 6mm;
                        left: 6mm;
                        right: 6mm;
                        bottom: 6mm;
                        border: 8px solid #42141E;
                        box-sizing: border-box;
                        /* No overflow hidden here, let content flow if needed, but it should fit */
                    }

                    /* 3. The Content Area: Padded inside the border */
                    .print-content {
                        width: 100%;
                        height: 100%;
                        padding: 15mm; /* Padding from the border */
                        box-sizing: border-box;
                    }

                    /* Compact Layout Adjustments for Print */
                    .logo { max-width: 90px; margin-bottom: 5px; }
                    .header h2 { font-size: 12px !important; margin-bottom: 5px; }
                    .intro-text { font-size: 9px; margin-bottom: 10px; }
                    .section-title { margin-top: 10px; margin-bottom: 5px; font-size: 10px; }
                    .total-score-box { padding: 8px; margin-top: 10px; }
                    .footer { margin-top: 15px; }
                    
                    .detailed-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 15px;
                        margin-top: 10px;
                    }
                    .detailed-pages .section-title { margin-top: 5px; }
                    table { font-size: 8px !important; }
                    td, th { padding: 2px 0 !important; }
                    
                    .pillar-block {
                        break-inside: avoid;
                        page-break-inside: avoid;
                        margin-bottom: 10px;
                        border: 1px solid #eee;
                        padding: 8px;
                        border-radius: 4px;
                    }
                    
                    /* Hide screen container styles if they leak */
                    .passport-screen-container {
                        border: none;
                        padding: 0;
                        margin: 0;
                        width: 100%;
                        min-height: 0;
                        box-shadow: none;
                    }
                }
            `}</style>

            {/* PAGE 1: SUMMARY */}
            <div className="print-page-wrapper passport-screen-container">
                <div className="print-border-container">
                    <div className="print-content">
                        {/* Header */}
                        <div className="header">
                            <img src="/logo.png" alt="Kadwood" className="logo" />
                            <h2 className="text-uppercase" style={{ fontSize: "16px", letterSpacing: "2px", color: "#42141E" }}>Transparency Passport</h2>
                        </div>

                        <div className="intro-text">
                            This Transparency Passport serves as a comprehensive record of your garment's journey.
                            It verifies the sustainability credentials, traces the supply chain from raw material to final production,
                            and quantifies the environmental impact, ensuring complete accountability and peace of mind.
                        </div>

                        {/* Product Info */}
                        <div className="grid-4" style={{ marginBottom: "20px" }}>
                            <div>
                                <p className="info-label">Order Reference</p>
                                <p className="info-value">{data.shopify_order_id || "N/A"}</p>
                            </div>
                            <div>
                                <p className="info-label">Item / Composition</p>
                                <p className="info-value">{data.item_name || "Custom Garment"}</p>
                                <p className="info-value" style={{ fontSize: "10px", fontWeight: "400" }}>{data.composition || "Wool"}</p>
                            </div>
                            <div>
                                <p className="info-label">Fabric Mill</p>
                                <p className="info-value">{data.mill_name || data.mill_id || "Unknown"}</p>
                            </div>
                            <div>
                                <p className="info-label">Collection / Article</p>
                                <p className="info-value">{data.collection_name || data.collection_id || "N/A"} / {data.article_code || "N/A"}</p>
                            </div>
                        </div>

                        {/* Scorecard */}
                        <div className="section-title">Sustainability Scorecard</div>
                        <div className="grid-2">
                            <div>
                                <div className="score-row">
                                    <span className="text-light" style={{ fontSize: "11px" }}>Fibre & Material Health</span>
                                    <span className="text-bold brand-color">{scores.score_fibre} / 25</span>
                                </div>
                                <div className="score-bar-bg"><div className="score-bar-fill" style={{ width: `${(scores.score_fibre / 25) * 100}%` }}></div></div>

                                <div className="score-row">
                                    <span className="text-light" style={{ fontSize: "11px" }}>Traceability</span>
                                    <span className="text-bold brand-color">{scores.score_traceability} / 25</span>
                                </div>
                                <div className="score-bar-bg"><div className="score-bar-fill" style={{ width: `${(scores.score_traceability / 25) * 100}%` }}></div></div>
                            </div>
                            <div>
                                <div className="score-row">
                                    <span className="text-light" style={{ fontSize: "11px" }}>Social Responsibility</span>
                                    <span className="text-bold brand-color">{scores.score_labour} / 25</span>
                                </div>
                                <div className="score-bar-bg"><div className="score-bar-fill" style={{ width: `${(scores.score_labour / 25) * 100}%` }}></div></div>

                                <div className="score-row">
                                    <span className="text-light" style={{ fontSize: "11px" }}>Climate & Circularity</span>
                                    <span className="text-bold brand-color">{scores.score_climate} / 25</span>
                                </div>
                                <div className="score-bar-bg"><div className="score-bar-fill" style={{ width: `${(scores.score_climate / 25) * 100}%` }}></div></div>
                            </div>
                        </div>

                        <div className="total-score-box">
                            <p className="info-label" style={{ marginBottom: "5px" }}>Total Impact Score</p>
                            <p style={{ fontSize: "36px", fontWeight: "300", color: "#42141E", lineHeight: "1" }}>{scores.total_score}</p>
                            <p style={{ fontSize: "9px", color: "#999", marginTop: "5px" }}>out of 100</p>
                            <p style={{ fontSize: "8px", color: "#666", marginTop: "8px", fontStyle: "italic", maxWidth: "90%", margin: "8px auto 0" }}>
                                * This score reflects our current visibility into the supply chain. A lower score does not necessarily indicate poor performance, but rather highlights areas where we are actively working to gain more data and transparency.
                            </p>
                        </div>

                        {/* Supply Chain Journey */}
                        {
                            data.emissions && data.emissions.legs && (
                                <>
                                    <div className="section-title">Supply Chain Journey</div>
                                    <div style={{ marginLeft: "10px" }}>
                                        {data.emissions.legs.map((leg, i) => (
                                            <div key={i} className="journey-step">
                                                <div className="journey-dot"></div>
                                                <p className="text-uppercase" style={{ fontSize: "10px", fontWeight: "600", color: "#42141E", marginBottom: "2px" }}>{leg.label}</p>
                                                <p style={{ fontSize: "11px", marginBottom: "1px" }}>{leg.from} → {leg.to}</p>
                                                <p style={{ fontSize: "9px", color: "#999" }}>{leg.distance} km via {leg.mode}</p>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ marginTop: "10px", padding: "8px", backgroundColor: "#f9f9f9", borderRadius: "4px", display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ fontSize: "10px", fontWeight: "600" }}>Total Distance: {data.emissions.totalDistance} km</span>
                                        <span style={{ fontSize: "10px", fontWeight: "600", color: "#42141E" }}>Est. Emissions: {data.emissions.emissionsKg} kg CO2e</span>
                                    </div>
                                </>
                            )
                        }

                        {/* Disclaimer */}
                        <div className="footer">
                            <p>Generated on {formatDate(data.created_at)} • Kadwood Transparency Engine</p>
                            <p style={{ marginTop: "5px", fontStyle: "italic" }}>
                                Disclaimer: This report is generated based on the information available at the time of production.
                                While Kadwood strives for accuracy, supply chain data is dynamic and subject to change.
                                This document does not constitute a legal guarantee or liability.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* PAGE 2: DETAILS */}
            {
                answers && answers.length > 0 && (
                    <div className="print-page-wrapper passport-screen-container detailed-pages">
                        <div className="print-border-container">
                            <div className="print-content">
                                <div className="header">
                                    <img src="/logo.png" alt="Kadwood" className="logo" />
                                    <h2 className="text-uppercase" style={{ fontSize: "14px", letterSpacing: "2px", color: "#42141E", marginTop: "5px" }}>Sustainability Details</h2>
                                </div>

                                <div className="detailed-grid">
                                    {SCORING_CONFIG.map(pillar => (
                                        <div key={pillar.id} className="pillar-block">
                                            <div className="section-title">{pillar.title}</div>
                                            <p style={{ fontSize: "10px", color: "#666", marginBottom: "10px" }}>{pillar.description}</p>
                                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                                                <thead>
                                                    <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                                                        <th style={{ padding: "6px 0", color: "#42141E", fontWeight: "600" }}>Criteria</th>
                                                        <th style={{ padding: "6px 0", color: "#42141E", fontWeight: "600" }}>Status</th>
                                                        <th style={{ padding: "6px 0", color: "#42141E", textAlign: "right", fontWeight: "600" }}>Points</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {pillar.questions.map(q => {
                                                        const ans = answers.find(a => a.question_id === q.id);
                                                        return (
                                                            <tr key={q.id} style={{ borderBottom: "1px solid #f9f9f9" }}>
                                                                <td style={{ padding: "6px 0", width: "50%" }}>{q.label}</td>
                                                                <td style={{ padding: "6px 0", fontWeight: "400" }}>{ans ? getAnswerText(q, ans.answer_value) : "-"}</td>
                                                                <td style={{ padding: "6px 0", textAlign: "right" }}>{ans ? ans.points_awarded : 0}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </>
    );
}
