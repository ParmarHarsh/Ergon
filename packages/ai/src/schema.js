import { EVIDENCE_TAXONOMY, validationError } from "../../shared/src/index.js";

export const AI_PROCESSING_STATUSES = ["not_started", "processing", "processed", "failed", "needs_review"];
export const AI_PROMPT_VERSION = "evidence-intelligence-v2";
export const AI_SCHEMA_VERSION = "evidence-intelligence-schema-v2";

// Azure Structured Outputs supports a deliberately limited JSON Schema subset.
// ERGON keeps semantic bounds in validateEvidenceAiOutput instead of weakening
// strict field/type enforcement or sending unsupported schema keywords.
const nullableString = (description) => ({ type: ["string", "null"], description });
const stringArray = (description) => ({ type: "array", description, items: { type: "string" } });

export const EVIDENCE_AI_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "detectedEvidenceType", "detectedTitle", "summary", "documentDate", "expirationDate", "facilityName",
    "employeeNames", "equipmentNames", "chemicalNames", "signaturePresent", "authorityMentions", "citationMentions",
    "issues", "confidence", "needsHumanReview", "suggestedRuleId", "suggestedObligationTitle", "matchReason",
    "missingFieldsOrIssues"
  ],
  properties: {
    detectedEvidenceType: { type: "string", enum: EVIDENCE_TAXONOMY },
    detectedTitle: nullableString("A concise title or null when absent."),
    summary: { type: "string", description: "A concise evidence summary grounded in the supplied document." },
    documentDate: nullableString("An exact YYYY-MM-DD date or null when absent or uncertain."),
    expirationDate: nullableString("An exact YYYY-MM-DD date or null when absent or uncertain."),
    facilityName: nullableString("The facility name or null when absent."),
    employeeNames: stringArray("Employee names explicitly present in the source."),
    equipmentNames: stringArray("Equipment names explicitly present in the source."),
    chemicalNames: stringArray("Chemical names explicitly present in the source."),
    signaturePresent: { type: ["boolean", "null"] },
    authorityMentions: stringArray("Authority mentions explicitly present in the source."),
    citationMentions: stringArray("Citation mentions explicitly present in the source."),
    issues: stringArray("Evidence issues or ambiguities requiring attention."),
    confidence: { type: "number", description: "Classification confidence from 0 through 1." },
    needsHumanReview: { type: "boolean" },
    suggestedRuleId: nullableString("An ID from the supplied applicable-obligation list or null."),
    suggestedObligationTitle: nullableString("The supplied obligation title or null; ERGON verifies it server-side."),
    matchReason: nullableString("A source-grounded reason for the candidate or null."),
    missingFieldsOrIssues: stringArray("Missing information or issues requiring human review.")
  }
};

export function validateEvidenceAiOutput(input, { reviewRequiredThreshold = 0.7 } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalidAiOutput("AI output must be an object", "$", "INVALID_TYPE");
  const expectedFields = new Set(EVIDENCE_AI_JSON_SCHEMA.required);
  const missingFields = EVIDENCE_AI_JSON_SCHEMA.required.filter((field) => !Object.hasOwn(input, field));
  if (missingFields.length) throw invalidAiOutput("AI output is missing a required field", missingFields[0], "MISSING_REQUIRED_FIELD");
  const unexpectedFields = Object.keys(input).filter((field) => !expectedFields.has(field));
  if (unexpectedFields.length) throw invalidAiOutput("AI output contains an unexpected field", unexpectedFields[0], "UNEXPECTED_FIELD");
  const validationWarnings = [];
  const detectedEvidenceType = requiredEnum(input.detectedEvidenceType, EVIDENCE_TAXONOMY, "detectedEvidenceType");
  const confidence = requiredNumber(input.confidence, "confidence", 0, 1);
  const suggestedRuleId = nullableBoundedString(input.suggestedRuleId, "suggestedRuleId", 160);

  const output = {
    detectedEvidenceType,
    detectedTitle: nullableBoundedString(input.detectedTitle, "detectedTitle", 300),
    summary: requiredBoundedString(input.summary, "summary", 2_000),
    documentDate: normalizeOptionalDate(input.documentDate, "documentDate", validationWarnings),
    expirationDate: normalizeOptionalDate(input.expirationDate, "expirationDate", validationWarnings),
    facilityName: nullableBoundedString(input.facilityName, "facilityName", 300),
    employeeNames: boundedStringArray(input.employeeNames, "employeeNames"),
    equipmentNames: boundedStringArray(input.equipmentNames, "equipmentNames"),
    chemicalNames: boundedStringArray(input.chemicalNames, "chemicalNames"),
    signaturePresent: nullableBoolean(input.signaturePresent, "signaturePresent"),
    authorityMentions: boundedStringArray(input.authorityMentions, "authorityMentions"),
    citationMentions: boundedStringArray(input.citationMentions, "citationMentions"),
    issues: boundedStringArray(input.issues, "issues", 100, 500),
    confidence,
    needsHumanReview: requiredBoolean(input.needsHumanReview, "needsHumanReview") || confidence < reviewRequiredThreshold || detectedEvidenceType === "other" || validationWarnings.length > 0,
    suggestedRuleId,
    suggestedObligationTitle: nullableBoundedString(input.suggestedObligationTitle, "suggestedObligationTitle", 300),
    matchReason: nullableBoundedString(input.matchReason, "matchReason", 1_000),
    missingFieldsOrIssues: boundedStringArray(input.missingFieldsOrIssues, "missingFieldsOrIssues", 100, 500)
  };
  Object.defineProperty(output, "validationWarnings", { value: Object.freeze(validationWarnings), enumerable: false });
  return output;
}

export function parseAiReviewInput(input) {
  const reviewActions = ["accept_ai", "override", "mark_accepted", "mark_rejected", "mark_needs_review", "request_more_evidence"];
  if (typeof input.action !== "string" || !reviewActions.includes(input.action)) throw validationError(`action must be one of: ${reviewActions.join(", ")}`);
  const action = input.action;
  const evidenceType = input.evidenceType === undefined || input.evidenceType === null || input.evidenceType === ""
    ? null
    : reviewEnum(input.evidenceType, EVIDENCE_TAXONOMY, "evidenceType");
  const ruleId = nullableBoundedString(input.ruleId, "ruleId", 160);
  const notes = nullableBoundedString(input.notes, "notes", 2_000);
  if (action === "override" && !evidenceType && !ruleId) throw validationError("Override requires evidenceType or ruleId");
  return { action, evidenceType, ruleId, notes };
}

function reviewEnum(value, allowed, field) {
  if (typeof value !== "string" || !allowed.includes(value)) throw validationError(`${field} must be one of: ${allowed.join(", ")}`);
  return value;
}

export function invalidAiOutput(message, field = "$", reasonCode = "INVALID_STRUCTURE") {
  const error = validationError(message);
  error.code = "AI_INVALID_OUTPUT";
  error.validationCategory = "STRUCTURAL_PROVIDER_OUTPUT";
  error.validationField = safeValidationField(field);
  error.validationReasonCode = reasonCode;
  return error;
}

function requiredEnum(value, allowed, field) {
  if (typeof value !== "string") throw invalidAiOutput(`${field} must be a string`, field, "INVALID_TYPE");
  if (!allowed.includes(value)) throw invalidAiOutput(`${field} is outside the allowed taxonomy`, field, "INVALID_ENUM");
  return value;
}

function requiredBoundedString(value, field, max) {
  if (typeof value !== "string") throw invalidAiOutput(`${field} must be a string`, field, "INVALID_TYPE");
  if (value.trim().length === 0) throw invalidAiOutput(`${field} must not be empty`, field, "EMPTY_REQUIRED_FIELD");
  if (value.length > max) throw invalidAiOutput(`${field} exceeds its server-side bound`, field, "OUT_OF_RANGE");
  return value.trim();
}

function nullableBoundedString(value, field, max) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw invalidAiOutput(`${field} must be null or a string`, field, "INVALID_TYPE");
  if (value.length > max) throw invalidAiOutput(`${field} exceeds its server-side bound`, field, "OUT_OF_RANGE");
  return value.trim() || null;
}

function requiredNumber(value, field, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw invalidAiOutput(`${field} must be a finite number`, field, "INVALID_TYPE");
  if (value < min || value > max) throw invalidAiOutput(`${field} is outside its allowed range`, field, "OUT_OF_RANGE");
  return value;
}

function requiredBoolean(value, field) {
  if (typeof value !== "boolean") throw invalidAiOutput(`${field} must be boolean`, field, "INVALID_TYPE");
  return value;
}

function nullableBoolean(value, field) {
  if (value === null || value === undefined) return null;
  return requiredBoolean(value, field);
}

function boundedStringArray(value, field, maxItems = 100, maxLength = 300) {
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== "string" || item.length > maxLength)) {
    throw invalidAiOutput(`${field} must be an array of bounded strings`, field, "INVALID_ARRAY");
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function normalizeOptionalDate(value, field, warnings) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw invalidAiOutput(`${field} must be null or a string`, field, "INVALID_TYPE");
  if (value.length > 64) throw invalidAiOutput(`${field} exceeds its server-side bound`, field, "OUT_OF_RANGE");
  const text = value.trim();
  if (!text) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    warnings.push(Object.freeze({ field, reasonCode: "INVALID_DATE" }));
    return null;
  }
  return text;
}

function safeValidationField(field) {
  return EVIDENCE_AI_JSON_SCHEMA.required.includes(field) ? field : "$";
}
