import { strToU8, zipSync } from "fflate";
import { createEvidenceAiProvider, evaluateEvidenceCases, extractEvidenceText } from "../packages/ai/src/index.js";
import { readConfig } from "../packages/config/src/index.js";

if (process.env.ERGON_LIVE_AI_ACCEPTANCE !== "true") {
  fail("Refusing live provider calls. Set ERGON_LIVE_AI_ACCEPTANCE=true to acknowledge that five synthetic requests may incur cost.");
}
if (process.env.AI_ENABLED !== "true" || !["openai", "azure_openai"].includes(process.env.AI_PROVIDER)) {
  fail("Live acceptance requires AI_ENABLED=true and AI_PROVIDER=openai or AI_PROVIDER=azure_openai.");
}
if (process.env.AI_PROVIDER === "openai" && (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL)) {
  failWithClassification("READY_MISSING_API_KEY", "Live OpenAI acceptance requires private OPENAI_API_KEY and OPENAI_MODEL environment values.");
}
if (process.env.AI_PROVIDER === "azure_openai") {
  const missing = ["AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_DEPLOYMENT"].filter((name) => !process.env[name]);
  if (missing.length > 0) failWithClassification("READY_MISSING_AZURE_CONFIGURATION", `Live Azure OpenAI acceptance is missing: ${missing.join(", ")}.`);
}

let config;
let provider;
try {
  config = readConfig(process.env);
  provider = createEvidenceAiProvider(config);
} catch (error) {
  const classification = process.env.AI_PROVIDER === "azure_openai" ? "READY_MISSING_AZURE_CONFIGURATION" : "BLOCKED_PROVIDER_CONFIGURATION";
  failWithClassification(classification, error.message);
}
const facility = { name: "Synthetic Acceptance Plant", country: "US", region: "OH", industry: "industrial_manufacturing" };
const applicableRules = [
  rule("synthetic-forklift", "Forklift operator training", "forklift_training_records"),
  rule("synthetic-hazcom", "Hazard communication training", "hazcom_training_records"),
  rule("synthetic-fire", "Fire extinguisher inspections", "fire_extinguisher_inspections"),
  rule("synthetic-loto", "Lockout/tagout procedure", "loto_procedures"),
  rule("synthetic-waste", "Hazardous waste manifests", "hazardous_waste_manifests")
];
const fixtures = syntheticFixtures();
const cases = [];
const safeRuns = [];

for (const fixture of fixtures) {
  const extraction = await extractEvidenceText({
    buffer: fixture.buffer,
    fileName: fixture.fileName,
    evidence: { title: fixture.title, description: "Synthetic Phase 25 acceptance fixture" },
    maxChars: config.aiMaxFileTextChars,
    maxBytes: config.maxUploadMb * 1024 * 1024
  });
  if (!extraction.text || !["extracted", "partial"].includes(extraction.extractionStatus)) {
    fail(`Synthetic ${fixture.format} extraction did not produce bounded text.`);
  }
  const evidence = { title: fixture.title, evidenceType: "other", fileName: fixture.fileName };
  try {
    const output = await provider.analyzeEvidenceDocument({ text: extraction.text, evidence, facility, applicableRules, extraction });
    const usage = output.providerUsage;
    cases.push({
      id: fixture.format,
      output,
      extraction,
      applicableRules,
      expectedEvidenceType: fixture.expectedEvidenceType,
      expectedFacts: fixture.expectedFacts,
      expectHumanReview: false
    });
    safeRuns.push({
      format: fixture.format,
      success: true,
      detectedEvidenceType: output.detectedEvidenceType,
      needsHumanReview: output.needsHumanReview,
      schemaValid: true,
      latencyMs: usage?.latencyMs ?? null,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      totalTokens: usage?.totalTokens ?? null
    });
  } catch (error) {
    const usage = error.providerUsage;
    safeRuns.push({
      format: fixture.format,
      success: false,
      schemaValid: false,
      errorCode: error.code || "AI_PROVIDER_ERROR",
      latencyMs: usage?.latencyMs ?? null,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      totalTokens: usage?.totalTokens ?? null
    });
  }
}

const evaluation = evaluateEvidenceCases(cases);
const passed = cases.length === fixtures.length && evaluation.metrics.schemaValidity === 1 && evaluation.metrics.documentTypeAccuracy >= 0.6;
const classification = liveClassification(provider.kind, passed, safeRuns);
process.stdout.write(`${JSON.stringify({
  classification,
  provider: provider.kind,
  model: provider.model,
  deployment: provider.deployment || null,
  promptVersion: cases[0]?.output.providerUsage?.promptVersion,
  schemaVersion: cases[0]?.output.providerUsage?.schemaVersion,
  syntheticOnly: true,
  requests: fixtures.length,
  runs: safeRuns,
  metrics: evaluation.metrics
}, null, 2)}\n`);
if (!passed) process.exitCode = 1;

function syntheticFixtures() {
  return [
    {
      format: "TXT",
      fileName: "synthetic-forklift.txt",
      title: "Forklift operator training record",
      buffer: Buffer.from("Forklift operator training record\nEmployee: Jordan Lee\nTraining date: 2026-06-12\nEquipment: Forklift"),
      expectedEvidenceType: "forklift_training_records",
      expectedFacts: ["Forklift"]
    },
    {
      format: "CSV",
      fileName: "synthetic-hazcom.csv",
      title: "Hazard communication training matrix",
      buffer: Buffer.from("employee,course,date\nAlex Kim,Hazard Communication,2026-05-10\nMorgan Chen,Hazard Communication,2026-05-11"),
      expectedEvidenceType: "hazcom_training_records",
      expectedFacts: []
    },
    {
      format: "PDF",
      fileName: "synthetic-fire-inspection.pdf",
      title: "Fire extinguisher inspection report",
      buffer: textPdf("Fire extinguisher inspection report. Inspection date 2026-06-30. Unit FE-204 passed visual inspection."),
      expectedEvidenceType: "fire_extinguisher_inspections",
      expectedFacts: []
    },
    {
      format: "DOCX",
      fileName: "synthetic-loto.docx",
      title: "Lockout tagout procedure",
      buffer: docx("Lockout tagout energy control procedure. Effective date 2026-04-01. Equipment: Press Brake PB-7."),
      expectedEvidenceType: "loto_procedures",
      expectedFacts: ["Press Brake PB-7"]
    },
    {
      format: "XLSX",
      fileName: "synthetic-waste.xlsx",
      title: "Hazardous waste manifest register",
      buffer: xlsx(),
      expectedEvidenceType: "hazardous_waste_manifests",
      expectedFacts: []
    }
  ];
}

function rule(id, title, evidenceType) {
  return { id, title, requiredEvidenceTypes: [evidenceType], authority: "Synthetic test authority", citation: "SYNTHETIC" };
}

function docx(text) {
  return Buffer.from(zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(`<w:document xmlns:w="urn"><w:body><w:p><w:r><w:t>${xml(text)}</w:t></w:r></w:p></w:body></w:document>`)
  }));
}

function xlsx() {
  return Buffer.from(zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8('<workbook xmlns:r="rels"><sheets><sheet name="Manifest" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/sharedStrings.xml": strToU8("<sst><si><t>Hazardous waste manifest</t></si><si><t>Manifest HW-104</t></si><si><t>2026-06-15</t></si></sst>"),
    "xl/worksheets/sheet1.xml": strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row></sheetData></worksheet>')
  }));
}

function textPdf(text) {
  const stream = `BT /F1 11 Tf 72 720 Td (${pdf(text)}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}

function xml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function pdf(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function failWithClassification(classification, message) {
  process.stderr.write(`${JSON.stringify({ classification, message })}\n`);
  process.exit(1);
}

function liveClassification(providerKind, passed, runs) {
  if (passed) return providerKind === "azure_openai" ? "PASSED_REAL_AZURE_OPENAI" : "PASSED_REAL_OPENAI";
  if (providerKind !== "azure_openai") return "FAILED_PROVIDER_REQUEST";
  const errorCodes = new Set(runs.map((run) => run.errorCode).filter(Boolean));
  if (errorCodes.has("AI_PROVIDER_AUTH_ERROR")) return "FAILED_AZURE_AUTHENTICATION";
  if (errorCodes.has("AI_PROVIDER_BAD_REQUEST")) return "BLOCKED_AZURE_DEPLOYMENT_OR_REGION";
  return "FAILED_AZURE_PROVIDER_REQUEST";
}
