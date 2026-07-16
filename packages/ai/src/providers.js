import { AI_PROMPT_VERSION, AI_SCHEMA_VERSION, EVIDENCE_AI_JSON_SCHEMA, invalidAiOutput, validateEvidenceAiOutput } from "./schema.js";

const SYSTEM_INSTRUCTIONS = `You are an evidence classification service for industrial audit preparation. Classify only from the supplied taxonomy and applicable obligation list. Extract only fields explicitly supported by the document text or supplied source anchors. Use null or empty arrays when unknown, abstain when evidence is insufficient, and set needsHumanReview when content is ambiguous. Suggest an obligation only when the source contains specific terminology supporting both the detected evidence type and that obligation; generic words such as record, corrective action, review, inspection, or training are not sufficient by themselves. Return null suggestion fields rather than forcing a weak match. Never claim compliance, legal applicability, legal sufficiency, certification, regulator approval, or that no further action is needed. Do not invent citations. Suggestions require human review and deterministic rules remain authoritative.`;

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

class ResponsesEvidenceProvider {
  constructor(config, options, fetchImpl = globalThis.fetch) {
    if (typeof fetchImpl !== "function") throw providerConfigError(`A fetch implementation is required for the ${options.providerLabel} AI provider`);
    this.model = options.model;
    this.deployment = options.deployment || null;
    this.endpoint = options.endpoint;
    this.headers = Object.freeze({ ...options.headers, "Content-Type": "application/json" });
    this.fetch = fetchImpl;
    this.reviewRequiredThreshold = config.aiReviewRequiredThreshold;
    this.timeoutMs = config.aiTimeoutMs ?? 30_000;
    this.maxOutputTokens = config.aiMaxOutputTokens ?? 2_000;
    this.kind = options.kind;
    this.providerLabel = options.providerLabel;
  }

  async analyzeEvidenceDocument({ text, evidence, facility, applicableRules, extraction = null }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await this.fetch(this.endpoint, {
        method: "POST",
        headers: this.headers,
        signal: controller.signal,
        body: JSON.stringify(buildResponsesRequest(this, { text, evidence, facility, applicableRules, extraction }))
      });
      if (!response.ok) {
        throw providerHttpError(this.providerLabel, response.status);
      }
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw invalidProviderResponse(this.providerLabel, { field: "$", reasonCode: "MALFORMED_PROVIDER_RESPONSE" });
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw invalidProviderResponse(this.providerLabel, { field: "$", reasonCode: "MALFORMED_PROVIDER_RESPONSE" });
      }
      assertCompleteResponse(payload, this.providerLabel);
      const outputText = getOutputText(payload);
      if (!outputText) throw invalidProviderResponse(this.providerLabel, { field: "$", reasonCode: "MISSING_STRUCTURED_OUTPUT" });
      let parsed;
      try {
        parsed = JSON.parse(outputText);
      } catch {
        throw invalidProviderResponse(this.providerLabel, { field: "$", reasonCode: "MALFORMED_JSON" });
      }
      let validated;
      try {
        validated = validateEvidenceAiOutput(parsed, { reviewRequiredThreshold: this.reviewRequiredThreshold });
      } catch (error) {
        if (error.code !== "AI_INVALID_OUTPUT") throw error;
        throw invalidProviderResponse(this.providerLabel, {
          category: error.validationCategory,
          field: error.validationField,
          reasonCode: error.validationReasonCode
        });
      }
      return attachProviderUsage(validated, {
        provider: this.kind,
        model: this.model,
        deployment: this.deployment,
        promptVersion: AI_PROMPT_VERSION,
        schemaVersion: AI_SCHEMA_VERSION,
        latencyMs: Date.now() - startedAt,
        inputTokens: safeTokenCount(payload.usage?.input_tokens),
        outputTokens: safeTokenCount(payload.usage?.output_tokens),
        totalTokens: safeTokenCount(payload.usage?.total_tokens),
        providerCalls: 1,
        resultCategory: "success",
        validationWarningCount: validated.validationWarnings?.length || 0
      });
    } catch (error) {
      if (error.name === "AbortError") {
        const timeoutError = new Error(`${this.providerLabel} evidence analysis timed out`);
        timeoutError.status = 504;
        timeoutError.code = "AI_PROVIDER_TIMEOUT";
        timeoutError.retryable = true;
        attachFailureUsage(timeoutError, this, startedAt);
        throw timeoutError;
      }
      if (!error.code) {
        const unavailableError = new Error(`${this.providerLabel} evidence analysis was unavailable`);
        unavailableError.status = 502;
        unavailableError.code = "AI_PROVIDER_UNAVAILABLE";
        unavailableError.retryable = true;
        attachFailureUsage(unavailableError, this, startedAt);
        throw unavailableError;
      }
      attachFailureUsage(error, this, startedAt);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class OpenAiEvidenceProvider extends ResponsesEvidenceProvider {
  constructor(config, fetchImpl = globalThis.fetch) {
    if (!config.openAiApiKey) throw providerConfigError("OPENAI_API_KEY is required for the OpenAI AI provider");
    if (!config.openAiModel) throw providerConfigError("OPENAI_MODEL is required for the OpenAI AI provider");
    super(config, {
      kind: "openai",
      providerLabel: "OpenAI",
      endpoint: OPENAI_RESPONSES_ENDPOINT,
      model: config.openAiModel,
      headers: { Authorization: `Bearer ${config.openAiApiKey}` }
    }, fetchImpl);
  }
}

export class AzureOpenAiEvidenceProvider extends ResponsesEvidenceProvider {
  constructor(config, fetchImpl = globalThis.fetch) {
    if (!config.azureOpenAiEndpoint) throw providerConfigError("AZURE_OPENAI_ENDPOINT is required for the Azure OpenAI AI provider");
    if (!config.azureOpenAiApiKey) throw providerConfigError("AZURE_OPENAI_API_KEY is required for the Azure OpenAI AI provider");
    if (!config.azureOpenAiDeployment) throw providerConfigError("AZURE_OPENAI_DEPLOYMENT is required for the Azure OpenAI AI provider");
    super(config, {
      kind: "azure_openai",
      providerLabel: "Azure OpenAI",
      endpoint: normalizeAzureOpenAiEndpoint(config.azureOpenAiEndpoint),
      model: config.azureOpenAiDeployment,
      deployment: config.azureOpenAiDeployment,
      headers: { "api-key": config.azureOpenAiApiKey }
    }, fetchImpl);
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
  if (config.aiProvider === "azure_openai") return new AzureOpenAiEvidenceProvider(config, options.fetchImpl);
  throw providerConfigError(`Unsupported AI provider: ${config.aiProvider}`);
}

export function providerMetadata(provider) {
  return { provider: provider.kind, model: provider.model || null, deployment: provider.deployment || null, promptVersion: AI_PROMPT_VERSION, schemaVersion: AI_SCHEMA_VERSION };
}

export function normalizeAzureOpenAiEndpoint(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw providerConfigError("AZURE_OPENAI_ENDPOINT must be a valid absolute HTTPS URL");
  }
  if (url.protocol !== "https:") throw providerConfigError("AZURE_OPENAI_ENDPOINT must use HTTPS");
  if (url.username || url.password) throw providerConfigError("AZURE_OPENAI_ENDPOINT must not contain embedded credentials");
  if (url.search || url.hash) throw providerConfigError("AZURE_OPENAI_ENDPOINT must not contain a query string or fragment");
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "" || path === "/") url.pathname = "/openai/v1/responses";
  else if (path === "/openai/v1") url.pathname = "/openai/v1/responses";
  else if (path === "/openai/v1/responses") url.pathname = path;
  else throw providerConfigError("AZURE_OPENAI_ENDPOINT path must be empty, /openai/v1, or /openai/v1/responses");
  return url.toString();
}

function buildResponsesRequest(provider, context) {
  return {
    model: provider.model,
    instructions: SYSTEM_INSTRUCTIONS,
    input: buildEvidencePrompt(context),
    max_output_tokens: provider.maxOutputTokens,
    text: {
      format: {
        type: "json_schema",
        name: "ergon_evidence_analysis",
        strict: true,
        schema: EVIDENCE_AI_JSON_SCHEMA
      }
    }
  };
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

function assertCompleteResponse(payload, providerLabel) {
  if (payload?.status === "incomplete") {
    const error = invalidProviderResponse(providerLabel, { field: "$", reasonCode: "INCOMPLETE_RESPONSE" });
    error.code = "AI_PROVIDER_INCOMPLETE";
    error.status = 502;
    error.retryable = payload.incomplete_details?.reason !== "content_filter";
    throw error;
  }
  for (const output of payload?.output || []) {
    for (const content of output.content || []) {
      if (content.type === "refusal" || typeof content.refusal === "string") {
        const error = invalidProviderResponse(providerLabel, { field: "$", reasonCode: "PROVIDER_REFUSAL" });
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
      deployment: provider.deployment || null,
      promptVersion: AI_PROMPT_VERSION,
      schemaVersion: AI_SCHEMA_VERSION,
      latencyMs: Date.now() - startedAt,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      providerCalls: 1,
      resultCategory: "failure",
      errorCode: error.code || "AI_PROVIDER_ERROR",
      validationCategory: error.validationCategory || null,
      validationField: error.validationField || null,
      validationReasonCode: error.validationReasonCode || null
    }),
    enumerable: false
  });
}

function providerHttpError(providerLabel, status) {
  const error = new Error(`${providerLabel} evidence analysis failed with status ${status}`);
  error.status = status === 408 || status === 504 ? 504 : 502;
  if (status === 401 || status === 403) {
    error.code = "AI_PROVIDER_AUTH_ERROR";
    error.retryable = false;
  } else if (status === 429) {
    error.code = "AI_PROVIDER_QUOTA_OR_LIMIT";
    error.retryable = true;
  } else if (status === 408 || status === 504) {
    error.code = "AI_PROVIDER_TIMEOUT";
    error.retryable = true;
  } else if (status === 400 || status === 404 || status === 422) {
    error.code = "AI_PROVIDER_BAD_REQUEST";
    error.retryable = false;
  } else if (status >= 500) {
    error.code = "AI_PROVIDER_UNAVAILABLE";
    error.retryable = true;
  } else {
    error.code = "AI_PROVIDER_ERROR";
    error.retryable = false;
  }
  return error;
}

function invalidProviderResponse(providerLabel, { category = "STRUCTURAL_PROVIDER_OUTPUT", field = "$", reasonCode = "INVALID_STRUCTURE" } = {}) {
  const error = invalidAiOutput(`${providerLabel} returned an invalid structured analysis.`, field, reasonCode);
  error.code = "AI_PROVIDER_INVALID_RESPONSE";
  error.validationCategory = category || "STRUCTURAL_PROVIDER_OUTPUT";
  error.status = 502;
  error.retryable = false;
  return error;
}

function providerConfigError(message) {
  const error = new Error(message);
  error.code = "AI_PROVIDER_CONFIG_ERROR";
  return error;
}
