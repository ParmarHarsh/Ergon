import { createHash } from "node:crypto";
import path from "node:path";
import { createOcrProvider, extractEvidenceText, providerMetadata } from "../../../packages/ai/src/index.js";
import { getApplicableRules } from "../../../packages/rules/src/index.js";
import { notFound, validationError } from "../../../packages/shared/src/index.js";

export function createEvidenceAiService({ config, repo, storage, provider, ocrProvider = createOcrProvider() }) {
  return {
    async processEvidence({ organizationId, evidenceId, userId, processingJobId = null, createdByType = "system" }) {
      const evidence = await repo.getEvidence(organizationId, evidenceId);
      if (!evidence) throw notFound("Evidence not found");
      const facility = await repo.getFacility(organizationId, evidence.facilityId);
      if (!facility) throw notFound("Facility not found");
      const { rules: applicableRules } = getApplicableRules(facility);
      const metadata = providerMetadata(provider);
      const jobAnalysis = processingJobId ? await repo.getAiAnalysisByJobId(organizationId, processingJobId) : null;
      if (jobAnalysis && ["processed", "needs_review"].includes(jobAnalysis.processingStatus)) return jobAnalysis;
      const previousAnalysis = jobAnalysis || await repo.getAiAnalysis(organizationId, evidenceId);
      let analysis = await repo.upsertAiAnalysis({
        ...baseAnalysis({ evidence, metadata, processingStatus: "processing", previousAnalysis }),
        ...(jobAnalysis || {}),
        processingStatus: "processing",
        processingJobId,
        createdByType,
        error: null
      });
      await logAiEvent(repo, { organizationId, facilityId: facility.id, userId, evidenceId, analysisId: analysis.id, action: "evidence_processing_started", metadata: { provider: metadata.provider } });
      if (!jobAnalysis) await logAiEvent(repo, { organizationId, facilityId: facility.id, userId, evidenceId, analysisId: analysis.id, action: "ai_analysis_version_created", metadata: { analysisVersion: analysis.analysisVersion, processingJobId } });
      if (!jobAnalysis && analysis.analysisVersion > 1) {
        await logAiEvent(repo, { organizationId, facilityId: facility.id, userId, evidenceId, analysisId: analysis.id, action: "evidence_reprocessing_started", metadata: { analysisVersion: analysis.analysisVersion, previousAnalysisId: analysis.previousAnalysisId } });
      }

      let lastExtraction = null;
      try {
        const buffer = evidence.fileReference ? await storage.readBuffer(evidence.fileReference) : null;
        let extraction = await extractEvidenceText({
          buffer,
          fileName: evidence.fileName,
          evidence,
          maxChars: config.aiMaxFileTextChars,
          maxBytes: config.maxUploadMb * 1024 * 1024
        });
        if (extraction.textExtractionStatus === "ocr_required" && buffer && ocrProvider.available) {
          const isPdf = path.extname(evidence.fileName || "").toLowerCase() === ".pdf";
          const ocr = isPdf
            ? await ocrProvider.extractTextFromScannedPdf({ buffer, evidence })
            : await ocrProvider.extractTextFromImage({ buffer, evidence });
          if (ocr.text) {
            extraction = {
              text: ocr.text.slice(0, config.aiMaxFileTextChars),
              normalizedText: ocr.text.slice(0, config.aiMaxFileTextChars),
              textExtractionStatus: "extracted",
              extractionStatus: ocr.text.length > config.aiMaxFileTextChars ? "partial" : "extracted",
              extractionMethod: "configured_ocr_provider",
              detectedFormat: isPdf ? "pdf" : path.extname(evidence.fileName || "").slice(1),
              truncated: ocr.text.length > config.aiMaxFileTextChars,
              warning: ocr.issues?.join("; ") || null,
              processingWarnings: ocr.issues || [],
              provenanceAnchors: [{ id: "ocr-output", type: isPdf ? "ocr_document" : "ocr_image", label: "OCR output", excerpt: ocr.text.slice(0, 240) }],
              structuredContent: { kind: "ocr_text" },
              documentMetadata: {},
              deterministicProfile: deterministicOcrProfile(ocr.text, isPdf ? "pdf" : "image", ocr.issues || [])
            };
          }
        }
        const contentHash = evidence.fileSha256 || createHash("sha256").update(extraction.text || "").digest("hex");
        extraction.deterministicProfile = {
          ...(extraction.deterministicProfile || {}),
          sourceFileName: evidence.fileName || null,
          fileSizeBytes: evidence.fileSizeBytes ?? buffer?.byteLength ?? null,
          contentHash
        };
        lastExtraction = extraction;
        await logAiEvent(repo, {
          organizationId, facilityId: facility.id, userId, evidenceId, analysisId: analysis.id,
          action: extractionAuditAction(extraction),
          metadata: { detectedFormat: extraction.detectedFormat, extractionStatus: extraction.extractionStatus, extractionMethod: extraction.extractionMethod, anchorCount: extraction.provenanceAnchors?.length || 0 }
        });

        if (!config.aiEnabled) {
          analysis = await repo.upsertAiAnalysis({
            ...baseAnalysis({ evidence, metadata, processingStatus: "needs_review", previousAnalysis }),
            id: analysis.id,
            ...extractionAnalysisFields(extraction),
            processingJobId,
            createdByType,
            contentHash,
            needsHumanReview: true,
            issues: extraction.processingWarnings || (extraction.warning ? [extraction.warning] : []),
            aiProfile: { status: "disabled", message: "AI analysis is not enabled. Deterministic extraction remains available for review." },
            error: "AI Evidence Intelligence is disabled. Deterministic extraction and manual review remain available."
          });
          await markNeedsReviewWhenPending(repo, evidence);
          await logAiEvent(repo, { organizationId, facilityId: facility.id, userId, evidenceId, analysisId: analysis.id, action: "evidence_processing_completed", metadata: { status: "needs_review", reason: "ai_disabled" } });
          return analysis;
        }

        if (["unsupported_for_text_extraction", "extraction_failed", "ocr_required", "empty"].includes(extraction.textExtractionStatus) || !extraction.text) {
          analysis = await repo.upsertAiAnalysis({
            ...baseAnalysis({ evidence, metadata, processingStatus: "needs_review", previousAnalysis }),
            id: analysis.id,
            ...extractionAnalysisFields(extraction),
            processingJobId,
            createdByType,
            contentHash,
            needsHumanReview: true,
            issues: [extraction.warning || "No extractable text was available."],
            aiProfile: { status: "not_run", reason: extraction.textExtractionStatus },
            error: extraction.warning || "No extractable text was available."
          });
          await markNeedsReviewWhenPending(repo, evidence);
          await logAiEvent(repo, { organizationId, facilityId: facility.id, userId, evidenceId, analysisId: analysis.id, action: "evidence_processing_completed", metadata: { status: "needs_review", extractionStatus: extraction.textExtractionStatus } });
          return analysis;
        }

        const output = await provider.analyzeEvidenceDocument({ text: extraction.text, evidence, facility, applicableRules });
        const suggestedRule = output.suggestedRuleId ? applicableRules.find((rule) => rule.id === output.suggestedRuleId) : null;
        const deterministicAgreement = Boolean(suggestedRule?.requiredEvidenceTypes.includes(output.detectedEvidenceType));
        const needsHumanReview = Boolean(previousAnalysis?.humanReviewed)
          || output.needsHumanReview
          || output.confidence < config.aiConfidenceThreshold
          || !deterministicAgreement;
        const issues = [...output.issues];
        if (extraction.truncated) issues.push(`Document text was bounded to ${config.aiMaxFileTextChars} characters before analysis.`);

        analysis = await repo.upsertAiAnalysis({
          ...baseAnalysis({ evidence, metadata, processingStatus: needsHumanReview ? "needs_review" : "processed", previousAnalysis }),
          id: analysis.id,
          processingJobId,
          createdByType,
          contentHash,
          outputHash: createHash("sha256").update(JSON.stringify(output)).digest("hex"),
          ...extractionAnalysisFields(extraction),
          detectedEvidenceType: output.detectedEvidenceType,
          detectedTitle: output.detectedTitle,
          extractedDocumentDate: output.documentDate,
          extractedExpirationDate: output.expirationDate,
          extractedFacilityName: output.facilityName,
          extractedEmployeeNames: output.employeeNames,
          extractedEquipmentNames: output.equipmentNames,
          extractedChemicalNames: output.chemicalNames,
          extractedSignaturePresent: output.signaturePresent,
          extractedAuthorityMentions: sourceSupportedMentions(output.authorityMentions, extraction.text),
          extractedCitationMentions: sourceSupportedMentions(output.citationMentions, extraction.text),
          summary: output.summary,
          issues,
          suggestedRuleId: output.suggestedRuleId,
          suggestedObligationTitle: output.suggestedObligationTitle,
          matchReason: output.matchReason,
          missingFieldsOrIssues: output.missingFieldsOrIssues,
          confidence: output.confidence,
          needsHumanReview,
          aiProfile: buildAiProfile(output, extraction, Boolean(previousAnalysis?.humanReviewed)),
          error: null
        });
        await logAiEvent(repo, { organizationId, facilityId: facility.id, userId, evidenceId, analysisId: analysis.id, action: "ai_classification_generated", metadata: { detectedEvidenceType: analysis.detectedEvidenceType, confidence: analysis.confidence, needsHumanReview } });
        await logAiEvent(repo, { organizationId, facilityId: facility.id, userId, evidenceId, analysisId: analysis.id, action: "evidence_intelligence_generated", metadata: { analysisVersion: analysis.analysisVersion, candidateCount: analysis.aiProfile?.keyFacts?.length || 0, sourceSupportedCandidateCount: analysis.aiProfile?.keyFacts?.filter((item) => item.supportStatus === "source_supported").length || 0 } });
        if (analysis.suggestedRuleId) {
          await logAiEvent(repo, { organizationId, facilityId: facility.id, userId, evidenceId, analysisId: analysis.id, action: "ai_match_suggested", metadata: { suggestedRuleId: analysis.suggestedRuleId, confidence: analysis.confidence, deterministicAgreement } });
        }
        await logAiEvent(repo, { organizationId, facilityId: facility.id, userId, evidenceId, analysisId: analysis.id, action: "evidence_processing_completed", metadata: { status: analysis.processingStatus, extractionStatus: analysis.textExtractionStatus } });
        return analysis;
      } catch (error) {
        analysis = await repo.upsertAiAnalysis({
          ...baseAnalysis({ evidence, metadata, processingStatus: "failed", previousAnalysis }),
          ...(lastExtraction ? extractionAnalysisFields(lastExtraction) : {}),
          id: analysis.id,
          processingJobId,
          createdByType,
          contentHash: evidence.fileSha256 || analysis.contentHash || null,
          textExtractionStatus: lastExtraction?.textExtractionStatus || analysis.textExtractionStatus || "failed",
          needsHumanReview: true,
          aiProfile: { status: "failed", errorCode: error.code || "AI_PROCESSING_ERROR" },
          error: safeError(error)
        });
        const action = error.code === "AI_INVALID_OUTPUT" ? "ai_output_rejected_invalid_schema" : "evidence_processing_failed";
        await logAiEvent(repo, { organizationId, facilityId: facility.id, userId, evidenceId, analysisId: analysis.id, action, metadata: { errorCode: error.code || "AI_PROCESSING_ERROR" } });
        if (error.code === "AI_INVALID_OUTPUT") error.status = 502;
        throw error;
      }
    },

    async reviewEvidence({ organizationId, evidenceId, reviewer, reviewInput }) {
      const evidence = await repo.getEvidence(organizationId, evidenceId);
      if (!evidence) throw notFound("Evidence not found");
      const analysis = await repo.getAiAnalysis(organizationId, evidenceId);
      if (!analysis) throw notFound("AI analysis not found");
      const facility = await repo.getFacility(organizationId, evidence.facilityId);
      const { rules } = getApplicableRules(facility);
      if (reviewInput.ruleId && !rules.some((rule) => rule.id === reviewInput.ruleId)) {
        throw validationError("ruleId must identify an applicable facility obligation");
      }

      const now = new Date().toISOString();
      const evidenceUpdates = {};
      const analysisUpdates = {
        humanReviewed: true,
        humanReviewerId: reviewer.id,
        humanReviewedAt: now,
        humanReviewNotes: reviewInput.notes,
        needsHumanReview: false
      };
      let auditAction;

      if (reviewInput.action === "accept_ai") {
        if (!analysis.detectedEvidenceType || analysis.detectedEvidenceType === "other") throw validationError("AI classification is not specific enough to accept");
        evidenceUpdates.evidenceType = analysis.detectedEvidenceType;
        evidenceUpdates.documentDate = analysis.extractedDocumentDate || evidence.documentDate;
        evidenceUpdates.expirationDate = analysis.extractedExpirationDate || evidence.expirationDate;
        if (analysis.suggestedRuleId) evidenceUpdates.relatedObligationId = analysis.suggestedRuleId;
        analysisUpdates.humanAcceptedAiResult = true;
        analysisUpdates.humanOverrideEvidenceType = analysis.detectedEvidenceType;
        analysisUpdates.humanOverrideRuleId = analysis.suggestedRuleId;
        auditAction = "human_accepted_ai_result";
      } else if (reviewInput.action === "override") {
        if (reviewInput.evidenceType) {
          evidenceUpdates.evidenceType = reviewInput.evidenceType;
          analysisUpdates.humanOverrideEvidenceType = reviewInput.evidenceType;
        }
        if (reviewInput.ruleId) {
          evidenceUpdates.relatedObligationId = reviewInput.ruleId;
          analysisUpdates.humanOverrideRuleId = reviewInput.ruleId;
        }
        auditAction = reviewInput.evidenceType ? "human_overrode_evidence_type" : "human_overrode_rule_match";
      } else if (reviewInput.action === "mark_accepted") {
        evidenceUpdates.status = "accepted";
        auditAction = "human_marked_evidence_accepted";
      } else if (reviewInput.action === "mark_rejected") {
        evidenceUpdates.status = "rejected";
        auditAction = "human_marked_evidence_rejected";
      } else if (reviewInput.action === "request_more_evidence") {
        evidenceUpdates.status = "needs_review";
        analysisUpdates.needsHumanReview = true;
        auditAction = "human_requested_more_evidence";
      } else {
        evidenceUpdates.status = "needs_review";
        analysisUpdates.needsHumanReview = true;
        auditAction = "human_review_started";
      }
      if (reviewInput.notes !== null) evidenceUpdates.reviewerNotes = reviewInput.notes;

      const result = await repo.applyAiHumanReview({
        organizationId,
        evidenceId,
        reviewerId: reviewer.id,
        evidenceUpdates,
        analysisUpdates,
        auditAction,
        auditMetadata: {
          action: reviewInput.action,
          evidenceTypeOverridden: Boolean(reviewInput.evidenceType),
          ruleMatchOverridden: Boolean(reviewInput.ruleId)
        }
      });
      if (reviewInput.action === "override" && reviewInput.evidenceType && reviewInput.ruleId) {
        await logAiEvent(repo, {
          organizationId,
          facilityId: evidence.facilityId,
          userId: reviewer.id,
          evidenceId,
          analysisId: analysis.id,
          action: "human_overrode_rule_match",
          metadata: { overrideRuleId: reviewInput.ruleId }
        });
      }
      await logAiEvent(repo, {
        organizationId,
        facilityId: evidence.facilityId,
        userId: reviewer.id,
        evidenceId,
        analysisId: analysis.id,
        action: reviewInput.action === "override" ? "evidence_intelligence_corrected" : "evidence_intelligence_reviewed",
        metadata: { reviewAction: reviewInput.action, analysisVersion: analysis.analysisVersion }
      });
      return result;
    }
  };
}

function baseAnalysis({ evidence, metadata, processingStatus, previousAnalysis = null }) {
  return {
    organizationId: evidence.organizationId,
    facilityId: evidence.facilityId,
    evidenceId: evidence.id,
    reviewId: null,
    processingStatus,
    textExtractionStatus: "not_started",
    detectedFormat: null,
    extractionStatus: null,
    extractionMethod: null,
    normalizedText: null,
    structuredContent: {},
    provenanceAnchors: [],
    documentMetadata: {},
    deterministicProfile: {},
    aiProfile: {},
    processingWarnings: [],
    detectedEvidenceType: null,
    detectedTitle: null,
    extractedDocumentDate: null,
    extractedExpirationDate: null,
    extractedFacilityName: null,
    extractedEmployeeNames: [],
    extractedEquipmentNames: [],
    extractedChemicalNames: [],
    extractedSignaturePresent: null,
    extractedAuthorityMentions: [],
    extractedCitationMentions: [],
    summary: null,
    issues: [],
    suggestedRuleId: null,
    suggestedObligationTitle: null,
    matchReason: null,
    missingFieldsOrIssues: [],
    confidence: null,
    needsHumanReview: true,
    provider: metadata.provider,
    model: metadata.model,
    promptVersion: metadata.promptVersion,
    rawModelOutputReference: null,
    processingJobId: null,
    createdByType: "system",
    contentHash: evidence.fileSha256 || null,
    outputHash: null,
    error: null,
    humanReviewed: previousAnalysis?.humanReviewed || false,
    humanAcceptedAiResult: previousAnalysis?.humanAcceptedAiResult || false,
    humanReviewerId: previousAnalysis?.humanReviewerId || null,
    humanReviewedAt: previousAnalysis?.humanReviewedAt || null,
    humanOverrideEvidenceType: previousAnalysis?.humanOverrideEvidenceType || null,
    humanOverrideRuleId: previousAnalysis?.humanOverrideRuleId || null,
    humanReviewNotes: previousAnalysis?.humanReviewNotes || null
  };
}

function extractionAnalysisFields(extraction) {
  return {
    textExtractionStatus: extraction.textExtractionStatus,
    detectedFormat: extraction.detectedFormat || null,
    extractionStatus: extraction.extractionStatus || null,
    extractionMethod: extraction.extractionMethod || null,
    normalizedText: extraction.normalizedText || "",
    structuredContent: extraction.structuredContent || {},
    provenanceAnchors: extraction.provenanceAnchors || [],
    documentMetadata: extraction.documentMetadata || {},
    deterministicProfile: extraction.deterministicProfile || {},
    processingWarnings: extraction.processingWarnings || []
  };
}

function buildAiProfile(output, extraction, preservedHumanReview) {
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

function candidateValues(category, values, extraction, confidence) {
  return (values || []).filter(Boolean).map((value) => {
    const normalized = String(value).toLowerCase();
    const anchors = (extraction.provenanceAnchors || []).filter((item) => String(item.excerpt || "").toLowerCase().includes(normalized));
    const provenance = anchors.map(({ excerpt: _excerpt, ...location }) => location);
    return { category, value, confidence, provenance, provenanceAnchorIds: anchors.map((item) => item.id), supportStatus: anchors.length ? "source_supported" : "unsupported_candidate" };
  });
}

function extractionAuditAction(extraction) {
  if (extraction.textExtractionStatus === "ocr_required") return "evidence_ocr_required";
  if (extraction.textExtractionStatus === "extraction_failed") return "evidence_extraction_failed";
  return "evidence_extraction_completed";
}

function deterministicOcrProfile(text, format, warnings) {
  return { format, characterCount: text.length, wordCount: text.trim() ? text.trim().split(/\s+/).length : 0, dates: [], identifiers: [], documentMetadata: {}, quality: { hasExtractableText: Boolean(text.trim()), partial: warnings.length > 0, warnings } };
}

async function markNeedsReviewWhenPending(repo, evidence) {
  if (evidence.status === "pending") await repo.updateEvidence(evidence.organizationId, evidence.id, { status: "needs_review" });
}

async function logAiEvent(repo, { organizationId, facilityId, userId, evidenceId, analysisId, action, metadata }) {
  await repo.logAudit({
    organizationId,
    facilityId,
    actorUserId: userId,
    action,
    entityType: "evidence_ai_analysis",
    entityId: analysisId,
    metadata: { evidenceId, ...metadata }
  });
}

function safeError(error) {
  return String(error?.message || "Evidence processing failed").slice(0, 500);
}

function sourceSupportedMentions(values, sourceText) {
  const source = sourceText.toLowerCase();
  return values.filter((value) => source.includes(value.toLowerCase()));
}
