import { readConfig } from "../../config/src/index.js";
import { createRepository } from "./repository.js";
import { hashPassword } from "../../../apps/api/src/security.js";
import { parseEvidenceInput, parseFacilityInput } from "../../shared/src/index.js";
import { generateReview, getApplicableRules } from "../../rules/src/index.js";

const config = readConfig(process.env);

if (config.isProduction) {
  throw new Error("Demo seed is disabled in production");
}
if (!config.enableDemoData) {
  throw new Error("Set ENABLE_DEMO_DATA=true to seed development data");
}
if (!config.adminPassword) {
  throw new Error("ADMIN_PASSWORD must be set before seeding demo data");
}

const repo = await createRepository(config);
const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

let org = await repo.findOrganizationByName("Demo Manufacturing Co.");
if (!org) {
  org = await repo.createOrganization({ name: "Demo Manufacturing Co." });
}

async function ensureUser(email, name, role) {
  const existing = await repo.findUserByEmail(email);
  if (existing) return existing;
  return repo.createUser({
    organizationId: org.id,
    email: email.toLowerCase(),
    passwordHash: await hashPassword(config.adminPassword),
    name,
    role,
    isActive: true
  });
}

const admin = await ensureUser(config.adminEmail, "Demo Admin", "admin");
const reviewer = await ensureUser("reviewer@complianceiq.local", "Demo Reviewer", "reviewer");
await ensureUser("manager@complianceiq.local", "Demo Manager", "compliance_manager");

let [facility] = await repo.listFacilities(org.id);
if (!facility) {
  facility = await repo.createFacility(parseFacilityInput({
    name: "Demo Metal Components Plant",
    country: "US",
    stateProvince: "Ohio",
    region: "OH",
    jurisdictionCode: "US-OH",
    industry: "industrial_manufacturing",
    facilityType: "metal_fabrication",
    employeeCount: 86,
    hazardProfile: {
      machinery: true,
      hazardousChemicals: true,
      sdsRequired: true,
      forklifts: true,
      lockoutTagout: true,
      ppe: true,
      hearingNoise: true,
      emergencyActionPlan: true,
      fireExtinguishers: true
    }
  }, org.id));
}

const applicable = getApplicableRules(facility);
await repo.saveApplicableRules(org.id, facility.id, applicable.rulesPack.rulesPackId, applicable.rules);
facility = await repo.getFacility(org.id, facility.id);

// Synthetic evidence in a spread of states so the demo shows the full
// workflow: accepted, AI-matched pending, low-confidence review, OCR
// review, expired, and rejected. All content is synthetic.
let evidence = await repo.listEvidence(org.id, facility.id);
if (evidence.length === 0) {
  const createEvidenceItem = (input) => repo.createEvidence(parseEvidenceInput({
    facilityId: facility.id,
    country: facility.country,
    region: facility.region,
    ...input
  }, org.id, admin.id));

  const loto = await createEvidenceItem({
    title: "Press line lockout/tagout procedures",
    description: "Synthetic demo evidence: equipment-specific energy control procedures for the stamping press line.",
    evidenceType: "loto_procedures",
    status: "accepted",
    confidence: "high",
    documentDate: daysFromNow(-90),
    reviewerNotes: "Procedures verified against equipment list during demo review."
  });
  const lotoTraining = await createEvidenceItem({
    title: "Authorized employee LOTO training roster",
    description: "Synthetic demo evidence: annual authorized/affected employee training sign-off sheet.",
    evidenceType: "loto_training_records",
    status: "accepted",
    confidence: "high",
    documentDate: daysFromNow(-60),
    expirationDate: daysFromNow(305)
  });
  const sds = await createEvidenceItem({
    title: "SDS library index — coating and degreasing chemicals",
    description: "Synthetic demo evidence: safety data sheet index for chemicals present in the coating area.",
    evidenceType: "sds_library",
    status: "accepted",
    confidence: "medium",
    documentDate: daysFromNow(-30)
  });
  const chemInventory = await createEvidenceItem({
    title: "Hazardous chemical inventory Q2",
    description: "Synthetic demo evidence: quarterly hazardous chemical inventory export.",
    evidenceType: "chemical_inventory",
    status: "pending",
    confidence: "medium",
    documentDate: daysFromNow(-14)
  });
  const forklift = await createEvidenceItem({
    title: "Forklift operator evaluations (scanned)",
    description: "Synthetic demo evidence: scanned operator evaluation forms, image quality is poor.",
    evidenceType: "other",
    status: "needs_review",
    confidence: "low",
    documentDate: daysFromNow(-21)
  });
  const extinguishers = await createEvidenceItem({
    title: "Fire extinguisher monthly inspection log",
    description: "Synthetic demo evidence: monthly extinguisher checks — the annual maintenance certificate has lapsed.",
    evidenceType: "fire_extinguisher_inspections",
    status: "expired",
    confidence: "medium",
    documentDate: daysFromNow(-400),
    expirationDate: daysFromNow(-35)
  });
  const guarding = await createEvidenceItem({
    title: "Machine guarding inspection log Q2",
    description: "Synthetic demo evidence: quarterly guard inspection log with corrective actions closed.",
    evidenceType: "machine_guarding_inspections",
    status: "accepted",
    confidence: "medium",
    documentDate: daysFromNow(-7)
  });
  const writtenHazcom = await createEvidenceItem({
    title: "Written hazard communication program",
    description: "Synthetic demo evidence: written HazCom program covering labels, SDS access, and training.",
    evidenceType: "written_hazcom_program",
    status: "accepted",
    confidence: "high",
    documentDate: daysFromNow(-120)
  });
  const hazcomTraining = await createEvidenceItem({
    title: "HazCom training completion report",
    description: "Synthetic demo evidence: annual hazard communication training completions for exposed employees.",
    evidenceType: "hazcom_training_records",
    status: "accepted",
    confidence: "medium",
    documentDate: daysFromNow(-45),
    expirationDate: daysFromNow(320)
  });
  const ppeAssessment = await createEvidenceItem({
    title: "PPE hazard assessment by job task",
    description: "Synthetic demo evidence: task-based PPE hazard assessment with selected controls.",
    evidenceType: "ppe_hazard_assessment",
    status: "accepted",
    confidence: "medium",
    documentDate: daysFromNow(-75)
  });
  const ppeTraining = await createEvidenceItem({
    title: "PPE training sign-off sheets",
    description: "Synthetic demo evidence: PPE training acknowledgments for affected employees.",
    evidenceType: "ppe_training_records",
    status: "accepted",
    confidence: "medium",
    documentDate: daysFromNow(-70)
  });
  const osha300 = await createEvidenceItem({
    title: "OSHA 300 injury and illness log",
    description: "Synthetic demo evidence: current-year OSHA 300 log.",
    evidenceType: "osha_300_log",
    status: "accepted",
    confidence: "high",
    documentDate: daysFromNow(-15)
  });
  const osha300a = await createEvidenceItem({
    title: "OSHA 300A annual summary (posted)",
    description: "Synthetic demo evidence: certified 300A summary from the prior year.",
    evidenceType: "osha_300a_summary",
    status: "accepted",
    confidence: "high",
    documentDate: daysFromNow(-150)
  });
  const eap = await createEvidenceItem({
    title: "Emergency action plan",
    description: "Synthetic demo evidence: written emergency action plan with evacuation routes.",
    evidenceType: "emergency_action_plan",
    status: "accepted",
    confidence: "medium",
    documentDate: daysFromNow(-200)
  });
  const emergencyTraining = await createEvidenceItem({
    title: "Evacuation drill record",
    description: "Synthetic demo evidence: annual evacuation drill summary and attendance.",
    evidenceType: "emergency_training_records",
    status: "accepted",
    confidence: "medium",
    documentDate: daysFromNow(-40)
  });
  const audiometric = await createEvidenceItem({
    title: "Audiometric testing summary 2024",
    description: "Synthetic demo evidence: prior-year audiometric summary submitted without the monitoring data.",
    evidenceType: "noise_monitoring_records",
    status: "rejected",
    confidence: "low",
    documentDate: daysFromNow(-420),
    reviewerNotes: "Rejected in demo review: missing supporting noise monitoring records."
  });
  evidence = [loto, lotoTraining, sds, chemInventory, forklift, extinguishers, guarding, audiometric, writtenHazcom, hazcomTraining, ppeAssessment, ppeTraining, osha300, osha300a, eap, emergencyTraining];

  // Seed AI analyses that mirror what the mock/OpenAI pipeline produces,
  // including a human-reviewed lineage entry and low-confidence queue items.
  const findRule = (id) => applicable.rules.find((rule) => rule.id === id) || null;
  const aiBase = (item) => ({
    organizationId: org.id,
    facilityId: facility.id,
    evidenceId: item.id,
    reviewId: null,
    textExtractionStatus: "extracted",
    detectedTitle: item.title,
    extractedFacilityName: facility.name,
    extractedEmployeeNames: [],
    extractedEquipmentNames: [],
    extractedChemicalNames: [],
    extractedSignaturePresent: null,
    extractedAuthorityMentions: [],
    extractedCitationMentions: [],
    extractedDocumentDate: item.documentDate,
    extractedExpirationDate: item.expirationDate || null,
    issues: [],
    missingFieldsOrIssues: [],
    provider: "mock",
    model: "mock-evidence-v1",
    promptVersion: "demo-seed",
    rawModelOutputReference: null,
    processingJobId: null,
    createdByType: "system",
    contentHash: null,
    outputHash: null,
    error: null,
    humanReviewed: false,
    humanAcceptedAiResult: false,
    humanReviewerId: null,
    humanReviewedAt: null,
    humanOverrideEvidenceType: null,
    humanOverrideRuleId: null,
    humanReviewNotes: null
  });

  const lotoRule = findRule("us-loto-procedures");
  await repo.upsertAiAnalysis({
    ...aiBase(loto),
    processingStatus: "processed",
    detectedEvidenceType: "loto_procedures",
    summary: "Document describes equipment-specific hazardous energy control steps for the press line.",
    extractedEquipmentNames: ["Stamping press", "Hydraulic shear"],
    extractedSignaturePresent: true,
    confidence: 0.94,
    needsHumanReview: false,
    suggestedRuleId: lotoRule?.id || null,
    suggestedObligationTitle: lotoRule?.title || null,
    matchReason: "Detected evidence type appears in the obligation's required evidence taxonomy.",
    humanReviewed: true,
    humanAcceptedAiResult: true,
    humanReviewerId: reviewer.id,
    humanReviewedAt: new Date().toISOString(),
    humanReviewNotes: "Demo review: classification and equipment references verified."
  });

  const hazcomRule = findRule("us-hazcom-sds-inventory");
  await repo.upsertAiAnalysis({
    ...aiBase(sds),
    processingStatus: "processed",
    detectedEvidenceType: "sds_library",
    summary: "Index of safety data sheets covering coating and degreasing chemicals in use.",
    extractedChemicalNames: ["Acetone", "Xylene", "Alkaline degreaser"],
    confidence: 0.9,
    needsHumanReview: false,
    suggestedRuleId: hazcomRule?.id || null,
    suggestedObligationTitle: hazcomRule?.title || null,
    matchReason: "SDS index aligns with the hazard communication evidence requirement."
  });

  await repo.upsertAiAnalysis({
    ...aiBase(chemInventory),
    processingStatus: "processed",
    detectedEvidenceType: "chemical_inventory",
    summary: "Quarterly hazardous chemical inventory export with quantities and storage locations.",
    extractedChemicalNames: ["Acetone", "Hydraulic oil", "Coolant concentrate"],
    confidence: 0.88,
    needsHumanReview: false,
    suggestedRuleId: hazcomRule?.id || null,
    suggestedObligationTitle: hazcomRule?.title || null,
    matchReason: "Inventory content matches the chemical inventory evidence requirement."
  });

  const forkliftRule = findRule("us-forklift-training");
  await repo.upsertAiAnalysis({
    ...aiBase(forklift),
    processingStatus: "needs_review",
    detectedEvidenceType: "forklift_training_records",
    summary: "Scanned forms appear to be forklift operator evaluations, but image quality limits extraction.",
    extractedEmployeeNames: ["J. Alvarez"],
    extractedEquipmentNames: ["Forklift"],
    confidence: 0.62,
    needsHumanReview: true,
    suggestedRuleId: forkliftRule?.id || null,
    suggestedObligationTitle: forkliftRule?.title || null,
    matchReason: "Partial text suggests operator training records; confidence below review threshold.",
    issues: ["Low-confidence classification. Human review required before this evidence strengthens the packet."]
  });

  const guardingRule = findRule("us-machine-guarding");
  await repo.upsertAiAnalysis({
    ...aiBase(guarding),
    processingStatus: "processed",
    detectedEvidenceType: "machine_guarding_inspections",
    summary: "Quarterly machine guard inspection log with corrective actions recorded as closed.",
    extractedEquipmentNames: ["Stamping press", "Belt conveyor"],
    extractedSignaturePresent: true,
    confidence: 0.86,
    needsHumanReview: false,
    suggestedRuleId: guardingRule?.id || null,
    suggestedObligationTitle: guardingRule?.title || null,
    matchReason: "Inspection log content matches the machine guarding evidence requirement."
  });
}

const existingReviews = await repo.listReviews(org.id, facility.id);
if (existingReviews.length === 0) {
  const aiAnalyses = await repo.listAiAnalyses(org.id, facility.id);
  const generated = generateReview({ facility, evidence, aiAnalyses });
  await repo.createReview({
    organizationId: org.id,
    facilityId: facility.id,
    rulesPackId: generated.rulesPack.rulesPackId,
    country: generated.country,
    region: generated.region,
    readinessScore: generated.readinessScore,
    scoreExplanation: generated.scoreExplanation,
    summary: generated.summary,
    generatedByUserId: admin.id,
    evidenceMatches: generated.evidenceMatches,
    gapRows: generated.gapRows,
    findings: generated.findings,
    actionPlan: generated.actionPlan
  });
}

console.error(`Seed complete for ${org.name}.`);
console.error(`  Admin:    ${admin.email}`);
console.error("  Reviewer: reviewer@complianceiq.local");
console.error("  Manager:  manager@complianceiq.local");
console.error("  All demo users share the ADMIN_PASSWORD value. Development use only.");
await repo.close?.();
