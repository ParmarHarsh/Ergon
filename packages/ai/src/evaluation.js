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
  const sourceSupportedFacts = candidates.filter((candidate) => candidate.supportStatus === "source_supported");
  const unsupportedCandidates = candidates.filter((candidate) => candidate.supportStatus !== "source_supported");
  return {
    status: "candidate",
    summary: groundedPrimarySummary(output, sourceSupportedFacts),
    summaryCandidate: { value: output.summary, supportStatus: "review_candidate" },
    documentTypeCandidate: output.detectedEvidenceType,
    titleCandidate: output.detectedTitle,
    purposeCandidate: null,
    evidenceCategories: output.detectedEvidenceType ? [output.detectedEvidenceType] : [],
    keyFacts: candidates,
    sourceSupportedFacts,
    unsupportedCandidates,
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
    qualityMetrics: qualityMetrics(candidates),
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
    correctReviewFlags: 0,
    dateCases: 0,
    correctDateCases: 0,
    negativeObligationCases: 0,
    obligationFalsePositives: 0,
    reviewerCorrectionCases: 0,
    preservedReviewerCorrections: 0
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
      const incorrectFacts = forbiddenFacts.filter((fact) => {
        const candidateIndex = values.indexOf(String(fact).toLowerCase());
        return candidateIndex >= 0 && support[candidateIndex] === "source_supported";
      }).length;
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
      if (Array.isArray(evaluationCase.expectedNormalizedDates)) {
        totals.dateCases += 1;
        const normalizedText = String(evaluationCase.extraction?.normalizedText || "");
        const datesPresent = evaluationCase.expectedNormalizedDates.every((date) => normalizedText.includes(date));
        const rawAbsent = (evaluationCase.forbiddenRawDateValues || []).every((value) => !normalizedText.includes(String(value)));
        if (datesPresent && rawAbsent) totals.correctDateCases += 1;
      }
      if (evaluationCase.expectSupportedObligation === false) {
        totals.negativeObligationCases += 1;
        if (evaluationCase.actualObligationClassification === "SUPPORTED_MATCH") totals.obligationFalsePositives += 1;
      }
      if (Object.hasOwn(evaluationCase, "expectedReviewerCorrection")) {
        totals.reviewerCorrectionCases += 1;
        if (JSON.stringify(evaluationCase.actualReviewerCorrection) === JSON.stringify(evaluationCase.expectedReviewerCorrection)) {
          totals.preservedReviewerCorrections += 1;
        }
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
      provenanceCoverage: ratio(totals.validProvenance, totals.sourcedCandidates),
      keyFactProvenanceCoverage: ratio(totals.validProvenance, totals.sourcedCandidates),
      validProvenanceRate: ratio(totals.validProvenance, totals.sourcedCandidates),
      dateNormalizationAccuracy: ratio(totals.correctDateCases, totals.dateCases),
      obligationFalsePositiveRate: ratio(totals.obligationFalsePositives, totals.negativeObligationCases),
      reviewerCorrectionPreservation: ratio(totals.preservedReviewerCorrections, totals.reviewerCorrectionCases),
      abstentionQuality: ratio(totals.correctAbstentions, totals.abstentionCases),
      humanReviewFlagQuality: ratio(totals.correctReviewFlags, totals.reviewFlagCases)
    },
    results
  };
}

export function summarizeAiQualityCounters(records) {
  return (records || []).reduce((counters, record) => {
    const analysis = record.analysis || record;
    const evidenceStatus = record.evidenceStatus || null;
    if (analysis.humanAcceptedAiResult) counters.aiAccepted += 1;
    if (analysis.humanReviewed && (analysis.humanOverrideEvidenceType || analysis.humanOverrideRuleId) && !analysis.humanAcceptedAiResult) counters.aiOverridden += 1;
    if (evidenceStatus === "rejected") counters.aiRejected += 1;
    if (analysis.aiProfile?.obligationMatch?.classification === "NO_SUPPORTED_MATCH") counters.noSupportedMatch += 1;
    if (analysis.aiProfile?.status === "failed") counters.providerFailed += 1;
    if (analysis.needsHumanReview) counters.humanReviewRequired += 1;
    return counters;
  }, { aiAccepted: 0, aiOverridden: 0, aiRejected: 0, noSupportedMatch: 0, providerFailed: 0, humanReviewRequired: 0 });
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

function groundedPrimarySummary(output, sourceSupportedFacts) {
  const type = String(output.detectedEvidenceType || "other").replaceAll("_", " ");
  if (!sourceSupportedFacts.length) {
    return `AI suggests ${type}, but no key facts were source-supported. Human review is required.`;
  }
  const facts = sourceSupportedFacts.slice(0, 5).map((fact) => `${fact.category.replaceAll("_", " ")}: ${fact.value}`);
  return `AI suggests ${type}. Source-supported facts: ${facts.join("; ")}.`;
}

function qualityMetrics(candidates) {
  const valid = candidates.filter((candidate) => candidate.supportStatus === "source_supported").length;
  const unsupported = candidates.filter((candidate) => candidate.supportStatus === "unsupported_candidate").length;
  const invalid = candidates.filter((candidate) => candidate.supportStatus === "invalid_provenance").length;
  return {
    keyFactProvenanceCoverage: ratio(valid, valid + invalid),
    validProvenanceRate: ratio(valid, valid + invalid),
    unsupportedClaimRate: ratio(unsupported, candidates.length),
    incorrectFactCount: 0
  };
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}
