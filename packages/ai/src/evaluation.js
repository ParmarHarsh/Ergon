import { validateEvidenceAiOutput } from "./schema.js";

export function groundEvidenceAiOutput(output, extraction, preservedHumanReview = false) {
  const candidates = [
    ...candidateValues("date", [output.documentDate, output.expirationDate], extraction, output.confidence),
    ...candidateValues("facility", [output.facilityName], extraction, output.confidence),
    ...candidateValues("employee", output.employeeNames, extraction, output.confidence),
    ...candidateValues("equipment", output.equipmentNames, extraction, output.confidence),
    ...candidateValues("chemical_or_material", output.chemicalNames, extraction, output.confidence),
    ...candidateValues("authority", output.authorityMentions, extraction, output.confidence),
    ...candidateValues("citation", output.citationMentions, extraction, output.confidence)
  ];
  const identifierCandidates = candidateValues("identifier", extraction.deterministicProfile?.identifiers || [], extraction, null);
  return {
    status: "candidate",
    summary: output.summary,
    documentTypeCandidate: output.detectedEvidenceType,
    titleCandidate: output.detectedTitle,
    purposeCandidate: null,
    evidenceCategories: output.detectedEvidenceType ? [output.detectedEvidenceType] : [],
    keyFacts: candidates,
    keyDates: candidates.filter((item) => item.category === "date"),
    organizations: [],
    facilities: candidates.filter((item) => item.category === "facility"),
    jurisdictions: [],
    products: [],
    processes: [],
    equipment: candidates.filter((item) => item.category === "equipment"),
    materials: candidates.filter((item) => item.category === "chemical_or_material"),
    permitsOrLicenses: identifierCandidates.filter((item) => /permit|license/i.test(item.value)),
    standardsOrRegulatoryIdentifiers: identifierCandidates,
    qualityConcerns: output.issues || [],
    missingInformation: output.missingFieldsOrIssues || [],
    followUpSuggestions: output.missingFieldsOrIssues || [],
    overallConfidence: output.confidence,
    preservedHumanReview,
    disclaimer: "AI output is a reviewable candidate, not legal applicability or a compliance conclusion."
  };
}

export function assessCandidateSupport(candidate, extraction) {
  const anchorsById = new Map((extraction.provenanceAnchors || []).map((anchor) => [anchor.id, anchor]));
  const anchorIds = Array.isArray(candidate.provenanceAnchorIds) ? candidate.provenanceAnchorIds : [];
  if (anchorIds.some((id) => !anchorsById.has(id))) return "invalid_provenance";
  if (!anchorIds.length) return "unsupported_candidate";
  const normalizedValue = String(candidate.value || "").trim().toLowerCase();
  if (!normalizedValue) return "invalid_provenance";
  return anchorIds.some((id) => String(anchorsById.get(id)?.excerpt || "").toLowerCase().includes(normalizedValue))
    ? "source_supported"
    : "invalid_provenance";
}

export function evaluateEvidenceCases(cases) {
  const totals = {
    cases: cases.length,
    schemaValid: 0,
    documentTypeCorrect: 0,
    expectedFacts: 0,
    expectedFactsFound: 0,
    incorrectFacts: 0,
    candidates: 0,
    unsupportedCandidates: 0,
    sourcedCandidates: 0,
    validProvenance: 0,
    abstentionCases: 0,
    correctAbstentions: 0,
    reviewFlagCases: 0,
    correctReviewFlags: 0
  };
  const results = [];

  for (const evaluationCase of cases) {
    try {
      const output = validateEvidenceAiOutput(evaluationCase.output, {
        applicableRules: evaluationCase.applicableRules || [],
        reviewRequiredThreshold: evaluationCase.reviewRequiredThreshold ?? 0.7
      });
      totals.schemaValid += 1;
      const profile = groundEvidenceAiOutput(output, evaluationCase.extraction || {});
      const facts = profile.keyFacts || [];
      const support = facts.map((candidate) => assessCandidateSupport(candidate, evaluationCase.extraction || {}));
      const values = facts.map((candidate) => String(candidate.value).toLowerCase());
      const expectedFacts = evaluationCase.expectedFacts || [];
      const forbiddenFacts = evaluationCase.forbiddenFacts || [];
      const foundFacts = expectedFacts.filter((fact) => values.includes(String(fact).toLowerCase())).length;
      const incorrectFacts = forbiddenFacts.filter((fact) => values.includes(String(fact).toLowerCase())).length;
      const typeCorrect = output.detectedEvidenceType === evaluationCase.expectedEvidenceType;
      totals.documentTypeCorrect += typeCorrect ? 1 : 0;
      totals.expectedFacts += expectedFacts.length;
      totals.expectedFactsFound += foundFacts;
      totals.incorrectFacts += incorrectFacts;
      totals.candidates += facts.length;
      totals.unsupportedCandidates += support.filter((state) => state === "unsupported_candidate").length;
      totals.sourcedCandidates += support.filter((state) => state !== "unsupported_candidate").length;
      totals.validProvenance += support.filter((state) => state === "source_supported").length;
      if (evaluationCase.expectAbstention) {
        totals.abstentionCases += 1;
        if (output.detectedEvidenceType === "other" && output.needsHumanReview) totals.correctAbstentions += 1;
      }
      if (typeof evaluationCase.expectHumanReview === "boolean") {
        totals.reviewFlagCases += 1;
        if (output.needsHumanReview === evaluationCase.expectHumanReview) totals.correctReviewFlags += 1;
      }
      results.push({ id: evaluationCase.id, schemaValid: true, typeCorrect, expectedFactsFound: foundFacts, expectedFacts: expectedFacts.length });
    } catch (error) {
      results.push({ id: evaluationCase.id, schemaValid: false, errorCode: error.code || "AI_EVALUATION_ERROR" });
    }
  }

  return {
    totals,
    metrics: {
      schemaValidity: ratio(totals.schemaValid, totals.cases),
      documentTypeAccuracy: ratio(totals.documentTypeCorrect, totals.schemaValid),
      factRecall: ratio(totals.expectedFactsFound, totals.expectedFacts),
      incorrectFactCount: totals.incorrectFacts,
      unsupportedClaimRate: ratio(totals.unsupportedCandidates, totals.candidates),
      provenanceCoverage: ratio(totals.sourcedCandidates, totals.candidates),
      validProvenanceRate: ratio(totals.validProvenance, totals.sourcedCandidates),
      abstentionQuality: ratio(totals.correctAbstentions, totals.abstentionCases),
      humanReviewFlagQuality: ratio(totals.correctReviewFlags, totals.reviewFlagCases)
    },
    results
  };
}

function candidateValues(category, values, extraction, confidence) {
  return (values || []).filter(Boolean).map((value) => {
    const normalized = String(value).toLowerCase();
    const anchors = (extraction.provenanceAnchors || []).filter((item) => String(item.excerpt || "").toLowerCase().includes(normalized));
    const provenance = anchors.map(({ excerpt: _excerpt, ...location }) => location);
    return {
      category,
      value,
      confidence,
      provenance,
      provenanceAnchorIds: anchors.map((item) => item.id),
      supportStatus: anchors.length ? "source_supported" : "unsupported_candidate"
    };
  });
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}
