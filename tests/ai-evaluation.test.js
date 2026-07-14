import test from "node:test";
import assert from "node:assert/strict";
import { assessCandidateSupport, evaluateEvidenceCases, groundEvidenceAiOutput } from "../packages/ai/src/index.js";

const extraction = {
  provenanceAnchors: [
    { id: "line-1", label: "Line 1", lineStart: 1, lineEnd: 1, excerpt: "Forklift inspection completed 2026-07-01" }
  ],
  deterministicProfile: { identifiers: [] }
};

test("grounding distinguishes supported, unsupported, and invalid provenance", () => {
  const profile = groundEvidenceAiOutput(output({ equipmentNames: ["Forklift", "Crane"] }), extraction);
  assert.equal(profile.equipment.find((item) => item.value === "Forklift").supportStatus, "source_supported");
  assert.equal(profile.equipment.find((item) => item.value === "Crane").supportStatus, "unsupported_candidate");
  assert.equal(assessCandidateSupport({ value: "Forklift", provenanceAnchorIds: ["missing-anchor"] }, extraction), "invalid_provenance");
  assert.equal(assessCandidateSupport({ value: "Crane", provenanceAnchorIds: ["line-1"] }, extraction), "invalid_provenance");
});

test("deterministic AI evaluation measures accuracy, grounding, abstention, and review flags", () => {
  const cases = [
    {
      id: "supported-forklift",
      output: output({ equipmentNames: ["Forklift"] }),
      extraction,
      expectedEvidenceType: "forklift_training_records",
      expectedFacts: ["Forklift"],
      expectHumanReview: false
    },
    {
      id: "unsupported-candidate",
      output: output({ equipmentNames: ["Crane"], needsHumanReview: true, confidence: 0.6 }),
      extraction,
      expectedEvidenceType: "forklift_training_records",
      expectedFacts: [],
      forbiddenFacts: ["Crane"],
      expectHumanReview: true
    },
    {
      id: "abstention",
      output: output({ detectedEvidenceType: "other", equipmentNames: [], confidence: 0.2, needsHumanReview: true, summary: "Insufficient evidence to classify." }),
      extraction: { provenanceAnchors: [], deterministicProfile: { identifiers: [] } },
      expectedEvidenceType: "other",
      expectedFacts: [],
      expectAbstention: true,
      expectHumanReview: true
    },
    {
      id: "misleading-regulation-mention",
      output: output({ detectedEvidenceType: "other", documentDate: null, equipmentNames: [], authorityMentions: [], confidence: 0.25, needsHumanReview: true, summary: "The regulation mention does not establish document type or legal applicability." }),
      extraction: { provenanceAnchors: [{ id: "line-1", excerpt: "ISO 14001 is mentioned only as unrelated background." }], deterministicProfile: { identifiers: ["ISO 14001"] } },
      expectedEvidenceType: "other",
      expectedFacts: [],
      expectAbstention: true,
      expectHumanReview: true
    },
    {
      id: "unrelated-content",
      output: output({ detectedEvidenceType: "other", documentDate: null, equipmentNames: [], confidence: 0.1, needsHumanReview: true, summary: "Unrelated content; insufficient evidence." }),
      extraction: { provenanceAnchors: [{ id: "line-1", excerpt: "Cafeteria menu for Friday." }], deterministicProfile: { identifiers: [] } },
      expectedEvidenceType: "other",
      expectedFacts: [],
      expectAbstention: true,
      expectHumanReview: true
    }
  ];
  const result = evaluateEvidenceCases(cases);
  assert.equal(result.metrics.schemaValidity, 1);
  assert.equal(result.metrics.documentTypeAccuracy, 1);
  assert.equal(result.metrics.factRecall, 1);
  assert.equal(result.metrics.incorrectFactCount, 1);
  assert.equal(result.metrics.unsupportedClaimRate, 0.4);
  assert.equal(result.metrics.provenanceCoverage, 0.6);
  assert.equal(result.metrics.validProvenanceRate, 1);
  assert.equal(result.metrics.abstentionQuality, 1);
  assert.equal(result.metrics.humanReviewFlagQuality, 1);
});

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
