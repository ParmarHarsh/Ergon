import { AI_PROMPT_VERSION, AI_SCHEMA_VERSION, EVIDENCE_AI_JSON_SCHEMA, invalidAiOutput, validateEvidenceAiOutput } from "./schema.js";

const SYSTEM_INSTRUCTIONS = `You are an evidence classification service for industrial audit preparation. Classify only from the supplied taxonomy and applicable obligation list. Extract only fields explicitly supported by the document text or supplied source anchors. Use null or empty arrays when unknown, abstain when evidence is insufficient, and set needsHumanReview when content is ambiguous. Never claim compliance, legal applicability, legal sufficiency, certification, regulator approval, or that no further action is needed. Do not invent citations. Suggestions require human review and deterministic rules remain authoritative.`;

export class OpenAiEvidenceProvider {
  constructor(config, fetchImpl = globalThis.fetch) {
    if (!config.openAiApiKey) throw providerConfigError("OPENAI_API_KEY is required for the OpenAI AI provider");
    if (!config.openAiModel) throw providerConfigError("OPENAI_MODEL is required for the OpenAI AI provider");
    if (typeof fetchImpl !== "function") throw providerConfigError("A fetch implementation is required for the OpenAI AI provider");
    this.apiKey = config.openAiApiKey;
    this.model = config.openAiModel;
    this.fetch = fetchImpl;
    this.reviewRequiredThreshold = config.aiReviewRequiredThreshold;
    this.timeoutMs = config.aiTimeoutMs ?? 30_000;
    this.maxOutputTokens = config.aiMaxOutputTokens ?? 2_000;
    this.kind = "openai";
  }

  async analyzeEvidenceDocument({ text, evidence, facility, applicableRules, extraction = null }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await this.fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          instructions: SYSTEM_INSTRUCTIONS,
          input: buildEvidencePrompt({ text, evidence, facility, applicableRules, extraction }),
          max_output_tokens: this.maxOutputTokens,
          text: {
            format: {
              type: "json_schema",
              name: "ergon_evidence_analysis",
              strict: true,
              schema: EVIDENCE_AI_JSON_SCHEMA
            }
          }
        })
      });
      if (!response.ok) {
        const error = new Error(`OpenAI evidence analysis failed with status ${response.status}`);
        error.status = 502;
        error.code = "AI_PROVIDER_ERROR";
        error.retryable = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
        throw error;
      }
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw invalidAiOutput("OpenAI response body was not valid JSON");
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw invalidAiOutput("OpenAI response body was malformed");
      assertCompleteResponse(payload);
      const outputText = getOutputText(payload);
      if (!outputText) throw invalidAiOutput("OpenAI response did not contain structured output text");
      let parsed;
      try {
        parsed = JSON.parse(outputText);
      } catch {
        throw invalidAiOutput("OpenAI response was not valid JSON");
      }
      const validated = validateEvidenceAiOutput(parsed, { applicableRules, reviewRequiredThreshold: this.reviewRequiredThreshold });
      return attachProviderUsage(validated, {
        provider: this.kind,
        model: this.model,
        promptVersion: AI_PROMPT_VERSION,
        schemaVersion: AI_SCHEMA_VERSION,
        latencyMs: Date.now() - startedAt,
        inputTokens: safeTokenCount(payload.usage?.input_tokens),
        outputTokens: safeTokenCount(payload.usage?.output_tokens),
        totalTokens: safeTokenCount(payload.usage?.total_tokens),
        providerCalls: 1,
        resultCategory: "success"
      });
    } catch (error) {
      if (error.name === "AbortError") {
        const timeoutError = new Error("OpenAI evidence analysis timed out");
        timeoutError.status = 504;
        timeoutError.code = "AI_PROVIDER_TIMEOUT";
        timeoutError.retryable = true;
        attachFailureUsage(timeoutError, this, startedAt);
        throw timeoutError;
      }
      attachFailureUsage(error, this, startedAt);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class MockEvidenceAiProvider {
  constructor(config = {}, resolver = null) {
    this.model = "mock-evidence-v1";
    this.kind = "mock";
    this.reviewRequiredThreshold = config.aiReviewRequiredThreshold ?? 0.7;
    this.resolver = resolver;
  }

  async analyzeEvidenceDocument(context) {
    const output = this.resolver ? await this.resolver(context) : heuristicMockOutput(context);
    const validated = validateEvidenceAiOutput(output, {
      applicableRules: context.applicableRules,
      reviewRequiredThreshold: this.reviewRequiredThreshold
    });
    return attachProviderUsage(validated, {
      provider: this.kind,
      model: this.model,
      promptVersion: AI_PROMPT_VERSION,
      schemaVersion: AI_SCHEMA_VERSION,
      latencyMs: 0,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      providerCalls: 1,
      resultCategory: "success"
    });
  }
}

export function createEvidenceAiProvider(config, options = {}) {
  if (!config.aiEnabled) return { kind: "disabled", model: null };
  if (config.aiProvider === "mock") return new MockEvidenceAiProvider(config, options.mockResolver);
  if (config.aiProvider === "openai") return new OpenAiEvidenceProvider(config, options.fetchImpl);
  throw providerConfigError(`Unsupported AI provider: ${config.aiProvider}`);
}

export function providerMetadata(provider) {
  return { provider: provider.kind, model: provider.model || null, promptVersion: AI_PROMPT_VERSION, schemaVersion: AI_SCHEMA_VERSION };
}

function buildEvidencePrompt({ text, evidence, facility, applicableRules, extraction }) {
  const obligations = applicableRules.map((rule) => ({
    id: rule.id,
    title: rule.title,
    requiredEvidenceTypes: rule.requiredEvidenceTypes,
    authority: rule.authority,
    citation: rule.citation
  }));
  return JSON.stringify({
    task: "Classify and extract this private evidence text, then suggest at most one applicable obligation match.",
    facility: { name: facility.name, country: facility.country, region: facility.region, industry: facility.industry },
    evidenceMetadata: { title: evidence.title, currentEvidenceType: evidence.evidenceType, fileName: evidence.fileName },
    deterministicProfile: extraction?.deterministicProfile || {},
    sourceAnchors: (extraction?.provenanceAnchors || []).slice(0, 100),
    applicableObligations: obligations,
    documentText: text
  });
}

function heuristicMockOutput({ text, evidence, applicableRules }) {
  const haystack = `${evidence.title || ""} ${text || ""}`.toLowerCase();
  const mappings = [
    [/forklift|powered industrial truck/, "forklift_training_records"],
    [/lockout|tagout|loto/, "loto_procedures"],
    [/safety data sheet|\bsds\b/, "sds_library"],
    [/hazard communication|hazcom/, "hazcom_training_records"],
    [/fire extinguisher/, "fire_extinguisher_inspections"],
    [/ppe|personal protective/, "ppe_training_records"],
    [/hazardous waste|manifest/, "hazardous_waste_manifests"],
    [/emergency action|evacuation/, "emergency_action_plan"]
  ];
  const detectedEvidenceType = mappings.find(([pattern]) => pattern.test(haystack))?.[1] || "other";
  const suggestedRule = applicableRules.find((rule) => rule.requiredEvidenceTypes.includes(detectedEvidenceType)) || null;
  const date = haystack.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] || null;
  const confidence = detectedEvidenceType === "other" ? 0.35 : 0.92;
  return {
    detectedEvidenceType,
    detectedTitle: evidence.title || "Evidence document",
    summary: detectedEvidenceType === "other" ? "The mock provider could not confidently classify this evidence." : `Likely ${detectedEvidenceType.replaceAll("_", " ")} evidence based on document text.`,
    documentDate: date,
    expirationDate: null,
    facilityName: null,
    employeeNames: [],
    equipmentNames: /forklift/.test(haystack) ? ["Forklift"] : [],
    chemicalNames: [],
    signaturePresent: null,
    authorityMentions: [],
    citationMentions: [],
    issues: detectedEvidenceType === "other" ? ["Document requires manual classification."] : [],
    confidence,
    needsHumanReview: detectedEvidenceType === "other",
    suggestedRuleId: suggestedRule?.id || null,
    suggestedObligationTitle: suggestedRule?.title || null,
    matchReason: suggestedRule ? "Detected evidence type appears in the obligation's required evidence taxonomy." : null,
    missingFieldsOrIssues: []
  };
}

function getOutputText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const output of payload.output || []) {
    for (const content of output.content || []) {
      if (typeof content.text === "string") return content.text;
    }
  }
  return null;
}

function assertCompleteResponse(payload) {
  if (payload?.status === "incomplete") {
    const reason = payload.incomplete_details?.reason || "unknown";
    const error = invalidAiOutput(`OpenAI response was incomplete (${reason})`);
    error.code = "AI_PROVIDER_INCOMPLETE";
    error.status = 502;
    error.retryable = reason !== "content_filter";
    throw error;
  }
  for (const output of payload?.output || []) {
    for (const content of output.content || []) {
      if (content.type === "refusal" || typeof content.refusal === "string") {
        const error = invalidAiOutput("OpenAI refused the evidence analysis request");
        error.code = "AI_PROVIDER_REFUSAL";
        error.status = 502;
        error.retryable = false;
        throw error;
      }
    }
  }
}

function safeTokenCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function attachProviderUsage(output, metadata) {
  Object.defineProperty(output, "providerUsage", { value: Object.freeze(metadata), enumerable: false });
  return output;
}

function attachFailureUsage(error, provider, startedAt) {
  if (error.providerUsage) return;
  Object.defineProperty(error, "providerUsage", {
    value: Object.freeze({
      provider: provider.kind,
      model: provider.model,
      promptVersion: AI_PROMPT_VERSION,
      schemaVersion: AI_SCHEMA_VERSION,
      latencyMs: Date.now() - startedAt,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      providerCalls: 1,
      resultCategory: "failure",
      errorCode: error.code || "AI_PROVIDER_ERROR"
    }),
    enumerable: false
  });
}

function providerConfigError(message) {
  const error = new Error(message);
  error.code = "AI_PROVIDER_CONFIG_ERROR";
  return error;
}
