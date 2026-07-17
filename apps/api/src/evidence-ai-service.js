import { createHash } from "node:crypto";
import path from "node:path";
import { createOcrProvider, extractEvidenceText, groundEvidenceAiOutput, providerMetadata } from "../../../packages/ai/src/index.js";
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
      if (jobAnalysis && ["processed", "needs_review"].includes(jobAnalysis.processingStatus) && jobAnalysis.aiProfile?.status !== "failed") return jobAnalysis;
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
        await logAiEvent(repo, {
          organizationId, facilityId: facility.id, userId, evidenceId, analysisId: analysis.id,
          action: "evidence_reprocessing_started",
          metadata: {
            analysisVersion: analysis.analysisVersion,
            previousAnalysisId: analysis.previousAnalysisId,
            preservedHumanDecision: Boolean(previousAnalysis?.humanReviewed),
            preservedEvidenceType: previousAnalysis?.humanOverrideEvidenceType || null,
            preservedRuleId: previousAnalysis?.humanOverrideRuleId || null
          }
        });
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

        const output = await provider.analyzeEvidenceDocument({ text: extraction.text, evidence, facility, applicableRules, extraction });
        const providerUsage = output.providerUsage || null;
        const groundedProfile = groundEvidenceAiOutput(output, extraction, Boolean(previousAnalysis?.humanReviewed));
        const obligationMatch = qualifyObligationSuggestion({
          output,
          applicableRules,
          sourceText: extraction.normalizedText || extraction.text,
          confidenceThreshold: config.aiConfidenceThreshold
        });
        const deterministicAgreement = obligationMatch.classification === "SUPPORTED_MATCH";
        const needsHumanReview = Boolean(previousAnalysis?.humanReviewed)
          || output.needsHumanReview
          || output.confidence < config.aiConfidenceThreshold
          || !deterministicAgreement;
        const issues = [...output.issues];
        for (const warning of output.validationWarnings || []) {
          if (warning.reasonCode === "INVALID_DATE") issues.push(`${humanFieldName(warning.field)} was not retained because it was not a valid exact date; human review is required.`);
        }
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
          summary: groundedProfile.summary,
          issues,
          suggestedRuleId: deterministicAgreement ? output.suggestedRuleId : null,
          suggestedObligationTitle: deterministicAgreement ? obligationMatch.candidateTitle : null,
          matchReason: deterministicAgreement ? output.matchReason : "No sufficiently supported obligation match — human review required.",
          missingFieldsOrIssues: output.missingFieldsOrIssues,
          confidence: output.confidence,
          needsHumanReview,
          aiProfile: {
            ...groundedProfile,
            obligationMatch,
            generationMetadata: providerUsage
          },
          error: null
        });
        await logAiEvent(repo, { organizationId, facilityId: facility.id, userId, evidenceId, analysisId: analysis.id, action: "ai_classification_generated", metadata: { detectedEvidenceType: analysis.detectedEvidenceType, confidence: analysis.confidence, needsHumanReview } });
        if (providerUsage) {
          await logAiEvent(repo, {
            organizationId, facilityId: facility.id, userId, evidenceId, analysisId: analysis.id,
            action: "ai_provider_usage_recorded",
            metadata: providerUsage
          });
        }
        await logAiEvent(repo, { organizationId, facilityId: facility.id, userId, evidenceId, analysisId: analysis.id, action: "evidence_intelligence_generated", metadata: { analysisVersion: analysis.analysisVersion, candidateCount: analysis.aiProfile?.keyFacts?.length || 0, sourceSupportedCandidateCount: analysis.aiProfile?.keyFacts?.filter((item) => item.supportStatus === "source_supported").length || 0 } });
        if (analysis.suggestedRuleId) {
          await logAiEvent(repo, { organizationId, facilityId: facility.id, userId, evidenceId, analysisId: analysis.id, action: "ai_match_suggested", metadata: { suggestedRuleId: analysis.suggestedRuleId, confidence: analysis.confidence, deterministicAgreement } });
        } else if (obligationMatch.classification === "WEAK_CANDIDATE") {
          await logAiEvent(repo, { organizationId, facilityId: facility.id, userId, evidenceId, analysisId: analysis.id, action: "ai_match_withheld_weak_support", metadata: { candidateRuleId: obligationMatch.candidateRuleId, reasonCode: obligationMatch.reasonCode } });
        }
        await logAiEvent(repo, { organizationId, facilityId: facility.id, userId, evidenceId, analysisId: analysis.id, action: "evidence_processing_completed", metadata: { status: analysis.processingStatus, extractionStatus: analysis.textExtractionStatus } });
        return analysis;
      } catch (error) {
        const extractionSucceeded = Boolean(lastExtraction?.text) && ["extracted", "partial"].includes(lastExtraction?.extractionStatus);
        const diagnostic = safeProviderDiagnostic(error);
        analysis = await repo.upsertAiAnalysis({
          ...baseAnalysis({ evidence, metadata, processingStatus: extractionSucceeded ? "needs_review" : "failed", previousAnalysis }),
          ...(lastExtraction ? extractionAnalysisFields(lastExtraction) : {}),
          id: analysis.id,
          processingJobId,
          createdByType,
          contentHash: evidence.fileSha256 || analysis.contentHash || null,
          textExtractionStatus: lastExtraction?.textExtractionStatus || analysis.textExtractionStatus || "failed",
          needsHumanReview: true,
          issues: extractionSucceeded ? ["AI analysis failed validation or provider processing. Deterministic extraction and source references remain available for human review."] : [],
          aiProfile: {
            status: "failed",
            errorCode: error.code || "AI_PROCESSING_ERROR",
            ...diagnostic,
            generationMetadata: error.providerUsage || null
          },
          error: safeAiFailureMessage(error, extractionSucceeded)
        });
        const action = ["AI_INVALID_OUTPUT", "AI_PROVIDER_INVALID_RESPONSE"].includes(error.code) ? "ai_output_rejected_invalid_schema" : "evidence_processing_failed";
        await markNeedsReviewWhenPending(repo, evidence);
        await logAiEvent(repo, {
          organizationId, facilityId: facility.id, userId, evidenceId, analysisId: analysis.id, action,
          metadata: error.providerUsage || { errorCode: error.code || "AI_PROCESSING_ERROR", ...diagnostic }
        });
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
      const beforeDecision = reviewDecisionSnapshot(evidence, analysis);
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
        if (!["processed", "needs_review"].includes(analysis.processingStatus) || analysis.aiProfile?.status === "failed") {
          throw validationError("A valid AI classification is not available to accept");
        }
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
        analysisUpdates.humanAcceptedAiResult = false;
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
        analysisUpdates.humanAcceptedAiResult = false;
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
      const afterDecision = reviewDecisionSnapshot({ ...evidence, ...evidenceUpdates }, { ...analysis, ...analysisUpdates });
      const originalCandidate = {
        evidenceType: analysis.detectedEvidenceType || null,
        suggestedRuleId: analysis.suggestedRuleId || analysis.aiProfile?.obligationMatch?.candidateRuleId || null,
        obligationClassification: analysis.aiProfile?.obligationMatch?.classification || "NO_SUPPORTED_MATCH",
        confidence: analysis.confidence ?? null
      };

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
          ruleMatchOverridden: Boolean(reviewInput.ruleId),
          provider: analysis.provider || null,
          model: analysis.model || null,
          promptVersion: analysis.promptVersion || null,
          schemaVersion: analysis.aiProfile?.generationMetadata?.schemaVersion || null,
          originalCandidate,
          beforeDecision,
          afterDecision,
          reviewerReasonProvided: Boolean(reviewInput.notes),
          reviewerReasonReference: reviewInput.notes ? "evidence_ai_analysis.humanReviewNotes" : null,
          reviewedAt: now,
          actorUserId: reviewer.id,
          evidenceId,
          evaluationCuration: evaluationCurationState(reviewInput.action)
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
        metadata: {
          reviewAction: reviewInput.action,
          analysisVersion: analysis.analysisVersion,
          beforeDecision,
          afterDecision,
          evaluationCuration: evaluationCurationState(reviewInput.action)
        }
      });
      return result;
    }
  };
}

export function qualifyObligationSuggestion({ output, applicableRules = [], sourceText = "", confidenceThreshold = 0.8 }) {
  if (!output?.suggestedRuleId) {
    return {
      classification: "NO_SUPPORTED_MATCH",
      candidateRuleId: null,
      candidateTitle: null,
      candidateReason: null,
      reasonCode: "NO_PROVIDER_CANDIDATE",
      reason: "No sufficiently supported obligation match — human review required."
    };
  }

  const rule = applicableRules.find((item) => item.id === output.suggestedRuleId) || null;
  const candidate = {
    candidateRuleId: output.suggestedRuleId,
    candidateTitle: rule?.title || null,
    candidateReason: output.matchReason || null
  };
  if (!rule) return weakMatch(candidate, "RULE_NOT_APPLICABLE", "The provider candidate is not an applicable facility obligation.");
  if (output.suggestedObligationTitle && normalizeMatchText(output.suggestedObligationTitle) !== normalizeMatchText(rule.title)) {
    return weakMatch(candidate, "TITLE_MISMATCH", "The provider title does not match ERGON's applicable-obligation title.");
  }
  if (!rule.requiredEvidenceTypes.includes(output.detectedEvidenceType)) {
    return weakMatch(candidate, "EVIDENCE_TYPE_MISMATCH", "The candidate obligation does not require the detected evidence type.");
  }
  if (!Number.isFinite(output.confidence) || output.confidence < confidenceThreshold) {
    return weakMatch(candidate, "BELOW_CONFIDENCE_THRESHOLD", "The provider confidence is below ERGON's precision-first match threshold.");
  }
  if (!sourceSupportsEvidenceType(sourceText, output.detectedEvidenceType)) {
    return weakMatch(candidate, "MISSING_SOURCE_SPECIFIC_SUPPORT", "The source lacks obligation-specific terminology for the detected evidence type.");
  }
  return {
    classification: "SUPPORTED_MATCH",
    ...candidate,
    reasonCode: "TYPE_AND_SOURCE_SUPPORTED",
    reason: "The applicable obligation, detected evidence type, confidence, and source-specific terminology agree."
  };
}

function weakMatch(candidate, reasonCode, detail) {
  return {
    classification: "WEAK_CANDIDATE",
    ...candidate,
    reasonCode,
    reason: `${detail} No sufficiently supported obligation match — human review required.`
  };
}

function sourceSupportsEvidenceType(sourceText, evidenceType) {
  const text = normalizeMatchText(sourceText);
  if (!text) return false;
  const signalGroups = {
    fire_extinguisher_inspections: [["fire", "extinguisher"]],
    loto_procedures: [["loto"], ["lockout", "tagout"], ["energy", "control", "procedure"]],
    loto_training_records: [["loto", "training"], ["lockout", "training"], ["tagout", "training"]],
    osha_300_log: [["osha", "300", "log"]],
    osha_300a_summary: [["osha", "300a", "summary"]],
    hazardous_waste_determination: [["hazardous", "waste", "determination"]],
    hazardous_waste_manifests: [["hazardous", "waste", "manifest"]],
    waste_area_inspections: [["waste", "area", "inspection"], ["hazardous", "waste", "inspection"]],
    hazcom_training_records: [["hazcom", "training"], ["hazard", "communication", "training"]],
    written_hazcom_program: [["hazcom", "program"], ["hazard", "communication", "program"]],
    forklift_training_records: [["forklift", "training"], ["powered", "industrial", "truck", "training"]],
    ppe_training_records: [["ppe", "training"], ["personal", "protective", "equipment", "training"]],
    ppe_hazard_assessment: [["ppe", "hazard", "assessment"], ["personal", "protective", "equipment", "assessment"]],
    sds_library: [["sds"], ["safety", "data", "sheet"]],
    chemical_inventory: [["chemical", "inventory"]]
  };
  const groups = signalGroups[evidenceType] || derivedEvidenceTypeSignals(evidenceType);
  return groups.some((group) => group.every((term) => matchTerm(text, term)));
}

function derivedEvidenceTypeSignals(evidenceType) {
  const generic = new Set(["record", "records", "inspection", "inspections", "training", "procedure", "procedures", "log", "logs", "summary", "review", "documentation"]);
  const terms = String(evidenceType || "").split("_").filter((term) => term && !generic.has(term));
  return terms.length ? [terms] : [];
}

function normalizeMatchText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchTerm(text, term) {
  return ` ${text} `.includes(` ${term} `);
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

function safeProviderDiagnostic(error) {
  return {
    validationCategory: error?.validationCategory || error?.providerUsage?.validationCategory || null,
    validationField: error?.validationField || error?.providerUsage?.validationField || null,
    validationReasonCode: error?.validationReasonCode || error?.providerUsage?.validationReasonCode || null
  };
}

function safeAiFailureMessage(error, extractionSucceeded) {
  const prefix = extractionSucceeded ? "Deterministic extraction succeeded, but " : "Evidence processing failed because ";
  if (["AI_INVALID_OUTPUT", "AI_PROVIDER_INVALID_RESPONSE"].includes(error?.code)) return `${prefix}the provider returned an invalid structured analysis.`;
  if (error?.code === "AI_PROVIDER_TIMEOUT") return `${prefix}the AI provider timed out.`;
  if (error?.code === "AI_PROVIDER_AUTH_ERROR") return `${prefix}the AI provider could not authenticate.`;
  if (error?.code === "AI_PROVIDER_QUOTA_OR_LIMIT") return `${prefix}the AI provider reached a rate, quota, or service limit.`;
  return `${prefix}the AI provider was unavailable.`;
}

function humanFieldName(field) {
  return field === "expirationDate" ? "Expiration date" : "Document date";
}

function sourceSupportedMentions(values, sourceText) {
  const source = sourceText.toLowerCase();
  return values.filter((value) => source.includes(value.toLowerCase()));
}

function reviewDecisionSnapshot(evidence, analysis) {
  return {
    evidenceType: evidence.evidenceType || null,
    relatedObligationId: evidence.relatedObligationId || null,
    evidenceStatus: evidence.status || null,
    humanReviewed: Boolean(analysis.humanReviewed),
    humanAcceptedAiResult: Boolean(analysis.humanAcceptedAiResult),
    humanOverrideEvidenceType: analysis.humanOverrideEvidenceType || null,
    humanOverrideRuleId: analysis.humanOverrideRuleId || null
  };
}

function evaluationCurationState(action) {
  return {
    eligibleForReview: ["override", "mark_rejected"].includes(action),
    status: "requires_explicit_deidentification_and_curation",
    automaticallyAdded: false,
    rawEvidenceIncluded: false
  };
}
