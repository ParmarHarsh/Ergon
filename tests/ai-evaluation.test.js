import test from "node:test";
import assert from "node:assert/strict";
import { assessCandidateSupport, evaluateEvidenceCases, groundEvidenceAiOutput, summarizeAiQualityCounters } from "../packages/ai/src/index.js";

const extraction = {
  provenanceAnchors: [
    { id: "line-1", label: "Line 1", lineStart: 1, lineEnd: 1, excerpt: "Forklift inspection completed 2026-07-01" }
  ],
  deterministicProfile: { identifiers: [] }
};

test("grounding distinguishes supported, unsupported, and invalid provenance", () => {
  const profile = groundEvidenceAiOutput(output({ equipmentNames: ["Forklift", "Crane"], summary: "Forklift and crane inspections were completed." }), extraction);
  assert.equal(profile.equipment.find((item) => item.value === "Forklift").supportStatus, "source_supported");
  assert.equal(profile.equipment.find((item) => item.value === "Crane").supportStatus, "unsupported_candidate");
  assert.match(profile.summary, /Source-supported facts:[\s\S]*equipment: Forklift/);
  assert.doesNotMatch(profile.summary, /Crane/);
  assert.equal(profile.unsupportedCandidates[0].value, "Crane");
  assert.equal(profile.summaryCandidate.supportStatus, "review_candidate");
  assert.equal(profile.qualityMetrics.keyFactProvenanceCoverage, 1);
  assert.equal(profile.qualityMetrics.unsupportedClaimRate, 1 / 3);
  assert.equal(assessCandidateSupport({ value: "Forklift", provenanceAnchorIds: ["missing-anchor"] }, extraction), "invalid_provenance");
  assert.equal(assessCandidateSupport({ value: "Crane", provenanceAnchorIds: ["line-1"] }, extraction), "invalid_provenance");
});

test("deterministic AI evaluation measures accuracy, grounding, abstention, and review flags", () => {
  const cases = [
    {
      id: "txt-supported-forklift",
      output: output({ equipmentNames: ["Forklift"] }),
      extraction: formatExtraction("txt", "Forklift inspection completed 2026-07-01"),
      expectedEvidenceType: "forklift_training_records",
      expectedFacts: ["Forklift"],
      expectHumanReview: false
    },
    {
      id: "csv-training-row",
      output: output({ employeeNames: ["Sam Lee"] }),
      extraction: formatExtraction("csv", "Sam Lee | Forklift | 2026-07-01"),
      expectedEvidenceType: "forklift_training_records", expectedFacts: ["Sam Lee"], expectHumanReview: false
    },
    {
      id: "pdf-environmental-inspection",
      output: output({ detectedEvidenceType: "waste_area_inspections", facilityName: "Plant A" }),
      extraction: formatExtraction("pdf", "Plant A hazardous waste area inspection"),
      expectedEvidenceType: "waste_area_inspections", expectedFacts: ["Plant A"], expectHumanReview: false
    },
    {
      id: "docx-loto-procedure",
      output: output({ detectedEvidenceType: "loto_procedures", equipmentNames: ["Press 4"] }),
      extraction: formatExtraction("docx", "Lockout tagout procedure for Press 4"),
      expectedEvidenceType: "loto_procedures", expectedFacts: ["Press 4"], expectHumanReview: false
    },
    {
      id: "xlsx-1900-date",
      output: output({ documentDate: "2024-01-01", equipmentNames: [] }),
      extraction: formatExtraction("xlsx", "Inspection date 2024-01-01", "Dates row 1: A1: 2024-01-01"),
      expectedEvidenceType: "forklift_training_records", expectedFacts: ["2024-01-01"], expectHumanReview: false,
      expectedNormalizedDates: ["2024-01-01"], forbiddenRawDateValues: ["45292"]
    },
    {
      id: "xlsx-1904-date",
      output: output({ documentDate: "1904-01-02", equipmentNames: [] }),
      extraction: formatExtraction("xlsx", "Inspection date 1904-01-02", "Dates row 1: A1: 1904-01-02"),
      expectedEvidenceType: "forklift_training_records", expectedFacts: ["1904-01-02"], expectHumanReview: false,
      expectedNormalizedDates: ["1904-01-02"], forbiddenRawDateValues: ["A1: 1\n"]
    },
    {
      id: "missing-fact",
      output: output({ documentDate: null, equipmentNames: [], missingFieldsOrIssues: ["Completion date not present"], needsHumanReview: true }),
      extraction: formatExtraction("txt", "Forklift training roster without completion date"),
      expectedEvidenceType: "forklift_training_records", expectedFacts: [], expectHumanReview: true
    },
    {
      id: "ambiguous-fact",
      output: output({ detectedEvidenceType: "other", documentDate: null, equipmentNames: [], confidence: 0.2, needsHumanReview: true, summary: "Insufficient evidence to classify." }),
      extraction: formatExtraction("txt", "Ambiguous maintenance note"),
      expectedEvidenceType: "other", expectedFacts: [], expectAbstention: true, expectHumanReview: true
    },
    {
      id: "unsupported-claim",
      output: output({ equipmentNames: ["Crane"], needsHumanReview: true, confidence: 0.6 }),
      extraction: formatExtraction("txt", "Forklift inspection completed"),
      expectedEvidenceType: "forklift_training_records", expectedFacts: [], forbiddenFacts: ["Crane"], expectHumanReview: true
    },
    {
      id: "misleading-regulation-mention",
      output: output({ detectedEvidenceType: "other", documentDate: null, equipmentNames: [], authorityMentions: [], confidence: 0.25, needsHumanReview: true, summary: "The regulation mention does not establish document type or legal applicability." }),
      extraction: formatExtraction("pdf", "ISO 14001 is mentioned only as unrelated background."),
      expectedEvidenceType: "other", expectedFacts: [], expectAbstention: true, expectHumanReview: true
    },
    {
      id: "weak-obligation-candidate",
      output: output({ equipmentNames: [] }), extraction: formatExtraction("xlsx", "Corrective action inspection record"),
      expectedEvidenceType: "forklift_training_records", expectedFacts: [], expectHumanReview: false,
      expectSupportedObligation: false, actualObligationClassification: "WEAK_CANDIDATE"
    },
    {
      id: "strong-obligation-match",
      output: output({ detectedEvidenceType: "loto_procedures", equipmentNames: ["Press 4"] }), extraction: formatExtraction("docx", "OSHA lockout tagout procedure for Press 4"),
      expectedEvidenceType: "loto_procedures", expectedFacts: ["Press 4"], expectHumanReview: false,
      actualObligationClassification: "SUPPORTED_MATCH"
    },
    {
      id: "no-obligation-match",
      output: output({ detectedEvidenceType: "other", equipmentNames: [], confidence: 0.2, needsHumanReview: true }), extraction: formatExtraction("txt", "General facility note"),
      expectedEvidenceType: "other", expectedFacts: [], expectAbstention: true, expectHumanReview: true,
      expectSupportedObligation: false, actualObligationClassification: "NO_SUPPORTED_MATCH"
    },
    {
      id: "combined-supported-and-unsupported",
      output: output({ equipmentNames: ["Forklift", "Crane"], needsHumanReview: true }), extraction: formatExtraction("txt", "Forklift inspection completed"),
      expectedEvidenceType: "forklift_training_records", expectedFacts: ["Forklift"], forbiddenFacts: ["Crane"], expectHumanReview: true
    },
    {
      id: "reviewer-override-preservation",
      output: output({ detectedEvidenceType: "loto_procedures", equipmentNames: [] }), extraction: formatExtraction("docx", "Lockout tagout procedure"),
      expectedEvidenceType: "loto_procedures", expectedFacts: [], expectHumanReview: false,
      expectedReviewerCorrection: { evidenceType: "ppe_training_records", ruleId: "us-ppe-training" },
      actualReviewerCorrection: { evidenceType: "ppe_training_records", ruleId: "us-ppe-training" }
    },
    {
      id: "unrelated-content",
      output: output({ detectedEvidenceType: "other", documentDate: null, equipmentNames: [], confidence: 0.1, needsHumanReview: true, summary: "Unrelated content; insufficient evidence." }),
      extraction: formatExtraction("txt", "Cafeteria menu for Friday."),
      expectedEvidenceType: "other", expectedFacts: [], expectAbstention: true, expectHumanReview: true
    }
  ];
  assert.ok(cases.length >= 15);
  const result = evaluateEvidenceCases(cases);
  process.stdout.write(`# Phase 26 deterministic quality metrics: ${JSON.stringify(result.metrics)}\n`);
  assert.equal(result.metrics.schemaValidity, 1);
  assert.equal(result.metrics.documentTypeAccuracy, 1);
  assert.equal(result.metrics.factRecall, 1);
  assert.equal(result.metrics.incorrectFactCount, 0);
  assert.equal(result.metrics.keyFactProvenanceCoverage, 1);
  assert.equal(result.metrics.validProvenanceRate, 1);
  assert.equal(result.metrics.dateNormalizationAccuracy, 1);
  assert.equal(result.metrics.obligationFalsePositiveRate, 0);
  assert.equal(result.metrics.reviewerCorrectionPreservation, 1);
  assert.equal(result.metrics.abstentionQuality, 1);
  assert.equal(result.metrics.humanReviewFlagQuality, 1);
});

test("quality counters aggregate review outcomes without document content", () => {
  const counters = summarizeAiQualityCounters([
    { humanAcceptedAiResult: true, needsHumanReview: false, aiProfile: { obligationMatch: { classification: "SUPPORTED_MATCH" } } },
    { humanReviewed: true, humanOverrideRuleId: "rule-1", needsHumanReview: false, aiProfile: { obligationMatch: { classification: "NO_SUPPORTED_MATCH" } } },
    { analysis: { needsHumanReview: true, aiProfile: { status: "failed" } }, evidenceStatus: "rejected" }
  ]);
  assert.deepEqual(counters, { aiAccepted: 1, aiOverridden: 1, aiRejected: 1, noSupportedMatch: 1, providerFailed: 1, humanReviewRequired: 1 });
});

function formatExtraction(format, excerpt, normalizedText = excerpt) {
  const locations = {
    txt: { lineStart: 1, lineEnd: 1 }, csv: { rowStart: 1, rowEnd: 1 }, pdf: { page: 1 },
    docx: { paragraphIndex: 1 }, xlsx: { sheet: "Sheet 1", rowStart: 1, rowEnd: 1, cellRange: "A1:D1" }
  };
  return { normalizedText, provenanceAnchors: [{ id: `${format}-source-1`, excerpt, ...locations[format] }], deterministicProfile: { identifiers: [] } };
}

function output(overrides = {}) {
  return {
    detectedEvidenceType: "forklift_training_records",
    detectedTitle: "Synthetic evidence",
    summary: "Synthetic forklift evidence.",
    documentDate: "2026-07-01",
    expirationDate: null,
    facilityName: null,
    employeeNames: [],
    equipmentNames: ["Forklift"],
    chemicalNames: [],
    signaturePresent: null,
    authorityMentions: [],
    citationMentions: [],
    issues: [],
    confidence: 0.9,
    needsHumanReview: false,
    suggestedRuleId: null,
    suggestedObligationTitle: null,
    matchReason: null,
    missingFieldsOrIssues: [],
    ...overrides
  };
}
