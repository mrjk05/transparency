export const SCORING_CONFIG = [
  {
    "id": "pillar_1",
    "title": "Pillar 1: Fibre & Material Health",
    "description": "Assesses the sustainability and safety of the raw materials, including certifications (Woolmark, RWS) and chemical management.",
    "max_score": 25,
    "questions": [
      {
        "id": "p1_woolmark",
        "label": "Woolmark Certified?",
        "type": "checkbox",
        "options": [{ "label": "Yes", "value": "yes", "points": 3 }]
      },
      {
        "id": "p1_rws",
        "label": "Responsible Wool Standard (RWS)?",
        "type": "checkbox",
        "options": [{ "label": "Yes", "value": "yes", "points": 3 }]
      },
      {
        "id": "p1_chemistry",
        "label": "Chemistry Management (Mill/Dye House)",
        "type": "select",
        "options": [
          { "label": "Yes (Compliant OEKO-TEX/ZDHC)", "value": "yes", "points": 5 },
          { "label": "Partial", "value": "partial", "points": 2 },
          { "label": "Unknown", "value": "no", "points": 0 }
        ]
      },
      {
        "id": "p1_rsl",
        "label": "Restricted Substances Evidence",
        "type": "checkbox",
        "options": [{ "label": "Documents held on file", "value": "yes", "points": 5 }]
      },
      {
        "id": "p1_trims",
        "label": "Lining & Trims",
        "type": "select",
        "options": [
          { "label": "Natural/Preferred Materials (Cupro/Metal/Horn/Silk)", "value": "yes", "points": 5 },
          { "label": "Mixed", "value": "partial", "points": 2 },
          { "label": "Synthetic/Plastic", "value": "no", "points": 0 }
        ]
      }
    ]
  },
  {
    "id": "pillar_2",
    "title": "Pillar 2: Traceability",
    "description": "Tracks the journey of the garment through the supply chain, ensuring visibility of all tier 1 and tier 2 suppliers.",
    "max_score": 25,
    "questions": [
      {
        "id": "p2_tier1",
        "label": "Tier 1: Tailoring Facility",
        "type": "dynamic_lookup",
        "lookup_type": "Atelier",
        "points_logic": "exists ? 5 : 0"
      },
      {
        "id": "p2_tier2",
        "label": "Tier 2: Fabric Mill",
        "type": "dynamic_lookup",
        "lookup_type": "Mill",
        "points_logic": "exists ? 5 : 0"
      },
      {
        "id": "p2_tier3",
        "label": "Tier 3: Raw Material Source Known?",
        "type": "checkbox",
        "options": [{ "label": "Yes (Region/Farm)", "value": "yes", "points": 5 }]
      },
      {
        "id": "p2_batch",
        "label": "Batch/Roll Tracking Available?",
        "type": "checkbox",
        "options": [{ "label": "Yes", "value": "yes", "points": 5 }]
      },
      {
        "id": "p2_transparency",
        "label": "Supplier Transparency Agreement Signed?",
        "type": "checkbox",
        "options": [{ "label": "Yes", "value": "yes", "points": 5 }]
      }
    ]
  },
  {
    "id": "pillar_3",
    "title": "Pillar 3: Social Responsibility & Labour",
    "description": "Evaluates the ethical standards and working conditions at production facilities, including modern slavery risks.",
    "max_score": 25,
    "questions": [
      {
        "id": "p3_audit",
        "label": "Social Audit (SMETA/BSCI/SA8000)",
        "type": "select",
        "options": [
          { "label": "Valid Audit (<2 years)", "value": "valid", "points": 5 },
          { "label": "Partial/Expired", "value": "partial", "points": 2 },
          { "label": "No", "value": "no", "points": 0 }
        ]
      },
      {
        "id": "p3_risk",
        "label": "Country Risk Level (Modern Slavery)",
        "type": "select",
        "options": [
          { "label": "Low Risk", "value": "low", "points": 5 },
          { "label": "Medium Risk (Mitigated)", "value": "med_mitigated", "points": 5 },
          { "label": "Medium Risk (No Mitigation)", "value": "med", "points": 2 },
          { "label": "High Risk", "value": "high", "points": 0 }
        ]
      },
      {
        "id": "p3_modern_slavery",
        "label": "Modern Slavery Due Diligence Logged?",
        "type": "checkbox",
        "options": [{ "label": "Yes", "value": "yes", "points": 5 }]
      },
      {
        "id": "p3_remedy",
        "label": "Grievance/Remediation Process?",
        "type": "select",
        "options": [
          { "label": "Yes", "value": "yes", "points": 5 },
          { "label": "No", "value": "no", "points": 0 }
        ]
      }
    ]
  },
  {
    "id": "pillar_4",
    "title": "Pillar 4: Climate & Circularity",
    "description": "Measures the environmental impact, including carbon footprint of transport and product longevity/circularity.",
    "max_score": 25,
    "questions": [
      {
        "id": "p4_fibre_impact",
        "label": "Fibre Impact Class",
        "type": "select",
        "options": [
          { "label": "Class A/B (Best)", "value": "A", "points": 5 },
          { "label": "Class C", "value": "C", "points": 2 },
          { "label": "Class D/E", "value": "E", "points": 0 }
        ]
      },
      {
        "id": "p4_co2_score",
        "label": "Transport Emissions (Calculated)",
        "type": "readonly_score",
        "options": []
      },
      {
        "id": "p4_longevity",
        "label": "Longevity Design (Full Canvas/Spare Cloth)",
        "type": "checkbox",
        "options": [{ "label": "Meets Standard", "value": "yes", "points": 5 }]
      },
      {
        "id": "p4_circular",
        "label": "Circular Offers (Repair/Take-back)",
        "type": "select",
        "options": [
          { "label": "Yes", "value": "yes", "points": 5 },
          { "label": "No", "value": "no", "points": 0 }
        ]
      },
      {
        "id": "p4_eol",
        "label": "End of Life Guidance Included?",
        "type": "checkbox",
        "options": [{ "label": "Yes", "value": "yes", "points": 5 }]
      }
    ]
  }
];
