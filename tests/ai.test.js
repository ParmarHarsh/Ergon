import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AzureOpenAiEvidenceProvider, createEvidenceAiProvider, extractEvidenceText, groundEvidenceAiOutput, MockEvidenceAiProvider, normalizeAzureOpenAiEndpoint, OpenAiEvidenceProvider, validateEvidenceAiOutput } from "../packages/ai/src/index.js";
import { createEvidenceAiService, qualifyObligationSuggestion } from "../apps/api/src/evidence-ai-service.js";
import { createPrivateStorage } from "../apps/api/src/storage.js";
import { FileRepository } from "../packages/db/src/file-repository.js";
import { parseEvidenceInput, parseFacilityInput } from "../packages/shared/src/index.js";
import { generateReview, getApplicableRules } from "../packages/rules/src/index.js";

const aiConfig = {
  aiEnabled: true,
  aiProvider: "mock",
  aiMaxFileTextChars: 1_000,
  aiConfidenceThreshold: 0.8,
  aiReviewRequiredThreshold: 0.7,
  maxUploadMb: 1,
  uploadStorageBackend: "local"
};

test("AI providers validate taxonomy, JSON, confidence, and bounded extraction", async () => {
  assert.equal(createEvidenceAiProvider({ aiEnabled: false }).kind, "disabled");
  const applicableRules = [{ id: "rule-1", title: "Forklift training", requiredEvidenceTypes: ["forklift_training_records"] }];
  const mock = new MockEvidenceAiProvider(aiConfig, () => output({ suggestedRuleId: "rule-1", suggestedObligationTitle: "Forklift training" }));
  const result = await mock.analyzeEvidenceDocument({ text: "forklift training", evidence: { title: "Certificate" }, facility: {}, applicableRules });
  assert.equal(result.detectedEvidenceType, "forklift_training_records");
  assert.equal(result.needsHumanReview, false);

  assert.throws(() => validateEvidenceAiOutput(output({ detectedEvidenceType: "invented_type" }), { applicableRules }), /detectedEvidenceType/);
  assert.throws(() => validateEvidenceAiOutput(output({ confidence: 1.2 }), { applicableRules }), /confidence/);
  assert.throws(() => validateEvidenceAiOutput({ ...output(), unexpected: true }, { applicableRules }), /unexpected fields/);
  const missingSummary = output();
  delete missingSummary.summary;
  assert.throws(() => validateEvidenceAiOutput(missingSummary, { applicableRules }), /missing required fields/);
  assert.throws(() => validateEvidenceAiOutput(output({ employeeNames: Array.from({ length: 101 }, () => "Employee") }), { applicableRules }), /at most 100/);
  const low = validateEvidenceAiOutput(output({ confidence: 0.4, needsHumanReview: false }), { applicableRules, reviewRequiredThreshold: 0.7 });
  assert.equal(low.needsHumanReview, true);

  const openai = new OpenAiEvidenceProvider({
    openAiApiKey: "test-key",
    openAiModel: "test-model",
    aiReviewRequiredThreshold: 0.7
  }, async () => ({ ok: true, status: 200, json: async () => ({ output_text: "not-json" }) }));
  await assert.rejects(() => openai.analyzeEvidenceDocument({ text: "text", evidence: {}, facility: {}, applicableRules }), /not valid JSON/);

  const malformedBody = new OpenAiEvidenceProvider({ openAiApiKey: "test-key", openAiModel: "test-model", aiReviewRequiredThreshold: 0.7 }, async () => ({
    ok: true,
    status: 200,
    json: async () => null
  }));
  await assert.rejects(() => malformedBody.analyzeEvidenceDocument({ text: "text", evidence: {}, facility: {}, applicableRules }), /malformed/);

  let requestBody;
  let requestUrl;
  let requestHeaders;
  const structured = new OpenAiEvidenceProvider({
    openAiApiKey: "test-key",
    openAiModel: "test-model",
    aiReviewRequiredThreshold: 0.7,
    aiTimeoutMs: 5_000,
    aiMaxOutputTokens: 1_500
  }, async (url, request) => {
    requestUrl = url;
    requestHeaders = request.headers;
    requestBody = JSON.parse(request.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: "completed", output_text: JSON.stringify(output()), usage: { input_tokens: 120, output_tokens: 80, total_tokens: 200 } })
    };
  });
  const structuredResult = await structured.analyzeEvidenceDocument({ text: "forklift training", evidence: {}, facility: {}, applicableRules, extraction: { deterministicProfile: {}, provenanceAnchors: [] } });
  assert.equal(requestBody.max_output_tokens, 1_500);
  assert.equal(requestUrl, "https://api.openai.com/v1/responses");
  assert.equal(requestHeaders.Authorization, "Bearer test-key");
  assert.equal(requestHeaders["api-key"], undefined);
  assert.equal(requestBody.text.format.strict, true);
  assert.equal(requestBody.text.format.schema.additionalProperties, false);
  assert.deepEqual(structuredResult.providerUsage.inputTokens, 120);
  assert.equal(JSON.stringify(structuredResult).includes("providerUsage"), false);

  const refusal = new OpenAiEvidenceProvider({ openAiApiKey: "test-key", openAiModel: "test-model", aiReviewRequiredThreshold: 0.7 }, async () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: "completed", output: [{ content: [{ type: "refusal", refusal: "Cannot process" }] }] })
  }));
  await assert.rejects(() => refusal.analyzeEvidenceDocument({ text: "text", evidence: {}, facility: {}, applicableRules }), (error) => error.code === "AI_PROVIDER_REFUSAL" && error.retryable === false);

  const incomplete = new OpenAiEvidenceProvider({ openAiApiKey: "test-key", openAiModel: "test-model", aiReviewRequiredThreshold: 0.7 }, async () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })
  }));
  await assert.rejects(() => incomplete.analyzeEvidenceDocument({ text: "text", evidence: {}, facility: {}, applicableRules }), (error) => error.code === "AI_PROVIDER_INCOMPLETE");

  const timeoutProvider = new OpenAiEvidenceProvider({ openAiApiKey: "test-key", openAiModel: "test-model", aiReviewRequiredThreshold: 0.7, aiTimeoutMs: 5 }, async (_url, request) => new Promise((_resolve, reject) => {
    request.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  }));
  await assert.rejects(() => timeoutProvider.analyzeEvidenceDocument({ text: "text", evidence: {}, facility: {}, applicableRules }), (error) => error.code === "AI_PROVIDER_TIMEOUT" && error.retryable === true);

  const extracted = await extractEvidenceText({ buffer: Buffer.from("a".repeat(100)), fileName: "record.txt", evidence: { title: "Record" }, maxChars: 20 });
  assert.equal(extracted.text.length, 20);
  assert.equal(extracted.truncated, true);
  const unsupported = await extractEvidenceText({ buffer: Buffer.from("%PDF"), fileName: "scan.pdf", evidence: { title: "Scan" }, maxChars: 100 });
  assert.equal(unsupported.textExtractionStatus, "extraction_failed");
});

test("Azure OpenAI uses the shared Responses contract with safe configuration, errors, and grounding", async () => {
  assert.equal(normalizeAzureOpenAiEndpoint("https://example.openai.azure.com"), "https://example.openai.azure.com/openai/v1/responses");
  assert.equal(normalizeAzureOpenAiEndpoint("https://example.openai.azure.com/openai/v1"), "https://example.openai.azure.com/openai/v1/responses");
  assert.equal(normalizeAzureOpenAiEndpoint("https://example.openai.azure.com/openai/v1/"), "https://example.openai.azure.com/openai/v1/responses");
  assert.equal(normalizeAzureOpenAiEndpoint("https://example.openai.azure.com/openai/v1/responses"), "https://example.openai.azure.com/openai/v1/responses");
  assert.throws(() => normalizeAzureOpenAiEndpoint("http://example.openai.azure.com"), /HTTPS/);
  assert.throws(() => normalizeAzureOpenAiEndpoint("not-a-url"), /valid absolute HTTPS URL/);
  assert.throws(() => normalizeAzureOpenAiEndpoint("https://user:secret@example.openai.azure.com"), /embedded credentials/);
  assert.throws(() => normalizeAzureOpenAiEndpoint("https://example.openai.azure.com/custom/path"), /path must be/);

  const applicableRules = [{ id: "rule-1", title: "Forklift training", requiredEvidenceTypes: ["forklift_training_records"] }];
  const azureConfig = {
    aiEnabled: true,
    aiProvider: "azure_openai",
    azureOpenAiEndpoint: "https://example.openai.azure.com/",
    azureOpenAiApiKey: "azure-test-secret",
    azureOpenAiDeployment: "ergon-test-deployment",
    aiReviewRequiredThreshold: 0.7,
    aiTimeoutMs: 5_000,
    aiMaxOutputTokens: 1_500
  };
  let requestUrl;
  let request;
  const provider = createEvidenceAiProvider(azureConfig, {
    fetchImpl: async (url, options) => {
      requestUrl = url;
      request = options;
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "completed", output_text: JSON.stringify(output({ equipmentNames: ["Forklift", "Crane"] })), usage: { input_tokens: 40, output_tokens: 20, total_tokens: 60 } })
      };
    }
  });
  const extraction = {
    deterministicProfile: { identifiers: [] },
    provenanceAnchors: [{ id: "line-1", excerpt: "Forklift training completed." }]
  };
  const result = await provider.analyzeEvidenceDocument({ text: "Forklift training completed.", evidence: {}, facility: {}, applicableRules, extraction });
  const body = JSON.parse(request.body);
  assert.equal(provider.kind, "azure_openai");
  assert.equal(requestUrl, "https://example.openai.azure.com/openai/v1/responses");
  assert.equal(request.headers["api-key"], "azure-test-secret");
  assert.equal(request.headers.Authorization, undefined);
  assert.equal(body.model, "ergon-test-deployment");
  assert.equal(body.text.format.name, "ergon_evidence_analysis");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
  assert.equal(result.providerUsage.provider, "azure_openai");
  assert.equal(result.providerUsage.deployment, "ergon-test-deployment");
  assert.equal(result.providerUsage.promptVersion, "evidence-intelligence-v2");
  assert.equal(result.providerUsage.schemaVersion, "evidence-intelligence-schema-v1");
  assert.equal(result.providerUsage.inputTokens, 40);
  const grounded = groundEvidenceAiOutput(result, extraction);
  assert.equal(grounded.equipment.find((item) => item.value === "Forklift").supportStatus, "source_supported");
  assert.equal(grounded.equipment.find((item) => item.value === "Crane").supportStatus, "unsupported_candidate");

  const malformed = new AzureOpenAiEvidenceProvider(azureConfig, async () => ({ ok: true, status: 200, json: async () => ({ output_text: "not-json" }) }));
  await assert.rejects(() => malformed.analyzeEvidenceDocument({ text: "text", evidence: {}, facility: {}, applicableRules }), (error) => error.code === "AI_PROVIDER_INVALID_RESPONSE");

  const refusal = new AzureOpenAiEvidenceProvider(azureConfig, async () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: "completed", output: [{ content: [{ type: "refusal", refusal: "Cannot process" }] }] })
  }));
  await assert.rejects(() => refusal.analyzeEvidenceDocument({ text: "text", evidence: {}, facility: {}, applicableRules }), (error) => error.code === "AI_PROVIDER_REFUSAL" && error.retryable === false);

  const timeout = new AzureOpenAiEvidenceProvider({ ...azureConfig, aiTimeoutMs: 5 }, async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  }));
  await assert.rejects(() => timeout.analyzeEvidenceDocument({ text: "text", evidence: {}, facility: {}, applicableRules }), (error) => error.code === "AI_PROVIDER_TIMEOUT" && error.retryable === true);

  for (const [status, code, retryable] of [
    [401, "AI_PROVIDER_AUTH_ERROR", false],
    [403, "AI_PROVIDER_AUTH_ERROR", false],
    [429, "AI_PROVIDER_QUOTA_OR_LIMIT", true],
    [400, "AI_PROVIDER_BAD_REQUEST", false],
    [503, "AI_PROVIDER_UNAVAILABLE", true]
  ]) {
    const failing = new AzureOpenAiEvidenceProvider(azureConfig, async () => ({ ok: false, status }));
    await assert.rejects(() => failing.analyzeEvidenceDocument({ text: "text", evidence: {}, facility: {}, applicableRules }), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.retryable, retryable);
      assert.equal(JSON.stringify({ message: error.message, usage: error.providerUsage }).includes("azure-test-secret"), false);
      return true;
    });
  }
});

test("obligation suggestions require source-specific support instead of generic recordkeeping language", () => {
  const facility = {
    country: "US",
    industry: "industrial_manufacturing",
    hazardProfile: { fireExtinguishers: true, lockoutTagout: true, machinery: true, hazardousWaste: true }
  };
  const rules = getApplicableRules(facility).rules;
  const rule = (id) => rules.find((item) => item.id === id);
  const candidate = (overrides) => output({ confidence: 0.93, ...overrides });

  const fire = qualifyObligationSuggestion({
    output: candidate({ detectedEvidenceType: "fire_extinguisher_inspections", suggestedRuleId: rule("us-fire-extinguishers").id }),
    applicableRules: rules,
    sourceText: "Monthly portable fire extinguisher inspection completed for Plant A."
  });
  assert.equal(fire.classification, "SUPPORTED_MATCH");

  const training = qualifyObligationSuggestion({
    output: candidate({ detectedEvidenceType: "osha_300_log", suggestedRuleId: rule("us-injury-recordkeeping").id }),
    applicableRules: rules,
    sourceText: "Safety training matrix with employee names, course titles, and completion dates."
  });
  assert.equal(training.classification, "WEAK_CANDIDATE");

  const environmental = qualifyObligationSuggestion({
    output: candidate({ detectedEvidenceType: "osha_300_log", suggestedRuleId: rule("us-injury-recordkeeping").id }),
    applicableRules: rules,
    sourceText: "Monthly environmental inspection of stormwater controls and housekeeping."
  });
  assert.equal(environmental.classification, "WEAK_CANDIDATE");

  const loto = qualifyObligationSuggestion({
    output: candidate({ detectedEvidenceType: "loto_procedures", suggestedRuleId: rule("us-loto-procedures").id }),
    applicableRules: rules,
    sourceText: "Equipment-specific lockout/tagout energy control procedure for maintenance."
  });
  assert.equal(loto.classification, "SUPPORTED_MATCH");

  const genericCorrectiveAction = qualifyObligationSuggestion({
    output: candidate({ detectedEvidenceType: "osha_300_log", suggestedRuleId: rule("us-injury-recordkeeping").id }),
    applicableRules: rules,
    sourceText: "Corrective action record reviewed and closed after inspection."
  });
  assert.equal(genericCorrectiveAction.classification, "WEAK_CANDIDATE");

  const injuryLog = qualifyObligationSuggestion({
    output: candidate({ detectedEvidenceType: "osha_300_log", suggestedRuleId: rule("us-injury-recordkeeping").id }),
    applicableRules: rules,
    sourceText: "OSHA 300 log of work-related injuries and illnesses."
  });
  assert.equal(injuryLog.classification, "SUPPORTED_MATCH");

  const none = qualifyObligationSuggestion({ output: candidate({ suggestedRuleId: null }), applicableRules: rules, sourceText: "General document." });
  assert.equal(none.classification, "NO_SUPPORTED_MATCH");
});

test("AI processing is auditable and human override wins over AI and deterministic suggestions", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ciq-ai-"));
  const repo = new FileRepository(path.join(dir, "db.json"));
  await repo.init();
  const org = await repo.createOrganization({ name: "AI Tenant" });
  const reviewer = await repo.createUser({ organizationId: org.id, email: "reviewer@example.com", passwordHash: "hash", name: "Reviewer", role: "reviewer", isActive: true });
  let facility = await repo.createFacility(parseFacilityInput({
    name: "Plant A", country: "US", stateProvince: "OH", region: "OH", industry: "industrial_manufacturing",
    facilityType: "fabrication", employeeCount: 30, hazardProfile: { machinery: true, lockoutTagout: true, ppe: true }
  }, org.id));
  const applicable = getApplicableRules(facility);
  await repo.saveApplicableRules(org.id, facility.id, applicable.rulesPack.rulesPackId, applicable.rules);
  facility = await repo.getFacility(org.id, facility.id);
  const storage = createPrivateStorage({ ...aiConfig, uploadDir: path.join(dir, "private") });
  const saved = await storage.saveBuffer(Buffer.from("Lockout Tagout procedure 2025-01-01"), "loto.txt");
  const evidence = await repo.createEvidence(parseEvidenceInput({
    facilityId: facility.id,
    title: "Energy control procedure",
    evidenceType: "other",
    status: "pending",
    fileReference: saved.fileReference,
    fileName: "loto.txt",
    contentType: "text/plain",
    fileSizeBytes: 40,
    fileSha256: saved.sha256
  }, org.id, reviewer.id));
  const provider = new MockEvidenceAiProvider(aiConfig);
  const service = createEvidenceAiService({ config: aiConfig, repo, storage, provider });

  const job = await repo.enqueueProcessingJob({ organizationId: org.id, facilityId: facility.id, evidenceId: evidence.id, createdByUserId: reviewer.id, maxAttempts: 3 });
  const analysis = await service.processEvidence({ organizationId: org.id, evidenceId: evidence.id, userId: reviewer.id, processingJobId: job.id });
  assert.equal(analysis.processingStatus, "processed");
  assert.equal(analysis.detectedEvidenceType, "loto_procedures");
  assert.equal(analysis.needsHumanReview, false);
  assert.equal(analysis.contentHash, saved.sha256);
  assert.equal(analysis.deterministicProfile.contentHash, saved.sha256);
  assert.equal(analysis.deterministicProfile.fileSizeBytes, 40);
  assert.equal(analysis.aiProfile.status, "candidate");
  assert.equal(analysis.aiProfile.obligationMatch.classification, "SUPPORTED_MATCH");
  assert.equal(analysis.aiProfile.generationMetadata.providerCalls, 1);
  assert.ok(Array.isArray(analysis.aiProfile.keyFacts));
  assert.ok(analysis.aiProfile.keyFacts.every((item) => ["source_supported", "unsupported_candidate"].includes(item.supportStatus)));
  assert.equal((await service.processEvidence({ organizationId: org.id, evidenceId: evidence.id, userId: reviewer.id, processingJobId: job.id })).id, analysis.id);
  assert.equal((await repo.getAiAnalysisHistory(org.id, evidence.id)).length, 1);

  const beforeReview = generateReview({ facility, evidence: [evidence], aiAnalyses: [analysis], now: new Date("2026-06-19T12:00:00Z") });
  assert.equal(beforeReview.gapRows.find((row) => row.ruleId === "us-loto-procedures").status, "missing");

  await service.reviewEvidence({ organizationId: org.id, evidenceId: evidence.id, reviewer, reviewInput: { action: "accept_ai", evidenceType: null, ruleId: null, notes: "Classification checked." } });
  await service.reviewEvidence({ organizationId: org.id, evidenceId: evidence.id, reviewer, reviewInput: { action: "mark_accepted", evidenceType: null, ruleId: null, notes: "Evidence accepted." } });
  let reviewedEvidence = await repo.getEvidence(org.id, evidence.id);
  let reviewedAnalysis = await repo.getAiAnalysis(org.id, evidence.id);
  const accepted = generateReview({ facility, evidence: [reviewedEvidence], aiAnalyses: [reviewedAnalysis], now: new Date("2026-06-19T12:00:00Z") });
  const acceptedLoto = accepted.gapRows.find((row) => row.ruleId === "us-loto-procedures");
  assert.equal(acceptedLoto.status, "accepted");
  assert.equal(acceptedLoto.matchedEvidence[0].matchSource, "human_reviewed");

  await service.reviewEvidence({
    organizationId: org.id,
    evidenceId: evidence.id,
    reviewer,
    reviewInput: { action: "override", evidenceType: "ppe_training_records", ruleId: "us-ppe-training", notes: "Document is PPE training, not LOTO." }
  });
  reviewedEvidence = await repo.getEvidence(org.id, evidence.id);
  reviewedAnalysis = await repo.getAiAnalysis(org.id, evidence.id);
  const overridden = generateReview({ facility, evidence: [reviewedEvidence], aiAnalyses: [reviewedAnalysis], now: new Date("2026-06-19T12:00:00Z") });
  assert.equal(overridden.gapRows.find((row) => row.ruleId === "us-loto-procedures").status, "missing");
  assert.equal(overridden.gapRows.find((row) => row.ruleId === "us-ppe-training").status, "accepted");

  await service.reviewEvidence({ organizationId: org.id, evidenceId: evidence.id, reviewer, reviewInput: { action: "request_more_evidence", evidenceType: null, ruleId: null, notes: "Provide the signed roster." } });
  assert.equal((await repo.getEvidence(org.id, evidence.id)).status, "needs_review");

  const reprocessed = await service.processEvidence({ organizationId: org.id, evidenceId: evidence.id, userId: reviewer.id, createdByType: "user" });
  assert.equal(reprocessed.analysisVersion, 2);
  assert.equal(reprocessed.humanReviewed, true);
  assert.equal(reprocessed.humanOverrideEvidenceType, "ppe_training_records");
  assert.equal(reprocessed.humanOverrideRuleId, "us-ppe-training");
  assert.equal(reprocessed.needsHumanReview, true);
  assert.equal(reprocessed.aiProfile.preservedHumanReview, true);
  assert.equal((await repo.getEvidence(org.id, evidence.id)).evidenceType, "ppe_training_records");

  const logs = await repo.listAuditLogs(org.id, facility.id);
  assert.ok(logs.some((entry) => entry.action === "evidence_processing_started"));
  assert.ok(logs.some((entry) => entry.action === "ai_match_suggested"));
  assert.ok(logs.some((entry) => entry.action === "human_accepted_ai_result"));
  assert.ok(logs.some((entry) => entry.action === "human_overrode_evidence_type"));
  assert.ok(logs.some((entry) => entry.action === "human_overrode_rule_match" && entry.metadata.overrideRuleId === "us-ppe-training"));
  assert.ok(logs.some((entry) => entry.action === "human_requested_more_evidence"));
  assert.ok(logs.some((entry) => entry.action === "evidence_extraction_completed"));
  assert.ok(logs.some((entry) => entry.action === "ai_provider_usage_recorded" && entry.metadata.providerCalls === 1));
  assert.equal(logs.some((entry) => JSON.stringify(entry.metadata).includes("Lockout Tagout procedure")), false);

  const otherOrg = await repo.createOrganization({ name: "Other Tenant" });
  await assert.rejects(() => repo.getAiAnalysis(otherOrg.id, evidence.id), /another organization/);
});

test("medium confidence requires review and invalid provider output is persisted as failure", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ciq-ai-failure-"));
  const repo = new FileRepository(path.join(dir, "db.json"));
  await repo.init();
  const org = await repo.createOrganization({ name: "Failure Tenant" });
  const user = await repo.createUser({ organizationId: org.id, email: "admin@example.com", passwordHash: "hash", name: "Admin", role: "admin", isActive: true });
  let facility = await repo.createFacility(parseFacilityInput({
    name: "Plant", country: "US", stateProvince: "MI", region: "MI", industry: "industrial_manufacturing",
    facilityType: "fabrication", employeeCount: 10, hazardProfile: { machinery: true, lockoutTagout: true }
  }, org.id));
  const applicable = getApplicableRules(facility);
  await repo.saveApplicableRules(org.id, facility.id, applicable.rulesPack.rulesPackId, applicable.rules);
  facility = await repo.getFacility(org.id, facility.id);
  const storage = createPrivateStorage({ ...aiConfig, uploadDir: path.join(dir, "private") });
  const saved = await storage.saveBuffer(Buffer.from("Lockout procedure"), "record.txt");
  const evidence = await repo.createEvidence(parseEvidenceInput({ facilityId: facility.id, title: "Record", evidenceType: "other", fileReference: saved.fileReference, fileName: "record.txt" }, org.id, user.id));
  const lotoRule = applicable.rules.find((rule) => rule.id === "us-loto-procedures");

  const disabledService = createEvidenceAiService({
    config: { ...aiConfig, aiEnabled: false },
    repo,
    storage,
    provider: createEvidenceAiProvider({ aiEnabled: false })
  });
  const disabledAnalysis = await disabledService.processEvidence({ organizationId: org.id, evidenceId: evidence.id, userId: user.id });
  assert.equal(disabledAnalysis.processingStatus, "needs_review");
  assert.match(disabledAnalysis.error, /disabled/i);
  assert.equal(disabledAnalysis.extractionStatus, "extracted");
  assert.equal(disabledAnalysis.aiProfile.status, "disabled");
  assert.ok(disabledAnalysis.provenanceAnchors.length > 0);

  const mediumProvider = new MockEvidenceAiProvider(aiConfig, () => output({ detectedEvidenceType: "loto_procedures", confidence: 0.75, suggestedRuleId: lotoRule.id, suggestedObligationTitle: lotoRule.title }));
  const mediumService = createEvidenceAiService({ config: aiConfig, repo, storage, provider: mediumProvider });
  const mediumAnalysis = await mediumService.processEvidence({ organizationId: org.id, evidenceId: evidence.id, userId: user.id });
  assert.equal(mediumAnalysis.needsHumanReview, true);
  assert.equal(mediumAnalysis.suggestedRuleId, null);
  assert.equal(mediumAnalysis.suggestedObligationTitle, null);
  assert.equal(mediumAnalysis.aiProfile.obligationMatch.classification, "WEAK_CANDIDATE");
  assert.match(mediumAnalysis.matchReason, /No sufficiently supported obligation match/);
  assert.ok(mediumAnalysis.aiProfile.keyFacts.some((item) => item.supportStatus === "unsupported_candidate"));

  const invalidProvider = new MockEvidenceAiProvider(aiConfig, () => output({ detectedEvidenceType: "invented" }));
  const invalidService = createEvidenceAiService({ config: aiConfig, repo, storage, provider: invalidProvider });
  await assert.rejects(() => invalidService.processEvidence({ organizationId: org.id, evidenceId: evidence.id, userId: user.id }), /detectedEvidenceType/);
  assert.equal((await repo.getAiAnalysis(org.id, evidence.id)).processingStatus, "failed");
  assert.equal((await repo.getAiAnalysis(org.id, evidence.id)).extractionStatus, "extracted");
  assert.match((await repo.getAiAnalysis(org.id, evidence.id)).normalizedText, /Lockout procedure/);
  assert.equal((await repo.getAiAnalysis(org.id, evidence.id)).aiProfile.status, "failed");
  const history = await repo.getAiAnalysisHistory(org.id, evidence.id);
  assert.deepEqual(history.map((item) => item.analysisVersion), [3, 2, 1]);
  assert.equal(history[0].isCurrent, true);
  assert.equal(history[1].isCurrent, false);
  assert.ok((await repo.listAuditLogs(org.id, facility.id)).some((entry) => entry.action === "ai_output_rejected_invalid_schema"));
});

function output(overrides = {}) {
  return {
    detectedEvidenceType: "forklift_training_records",
    detectedTitle: "Forklift Operator Training Certificate",
    summary: "Likely powered industrial truck training evidence.",
    documentDate: "2025-03-14",
    expirationDate: "2028-03-14",
    facilityName: null,
    employeeNames: [],
    equipmentNames: ["Forklift"],
    chemicalNames: [],
    signaturePresent: true,
    authorityMentions: [],
    citationMentions: [],
    issues: [],
    confidence: 0.88,
    needsHumanReview: false,
    suggestedRuleId: null,
    suggestedObligationTitle: null,
    matchReason: null,
    missingFieldsOrIssues: [],
    ...overrides
  };
}
