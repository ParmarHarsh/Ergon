import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { FileRepository } from "../packages/db/src/file-repository.js";
import { parseFacilityInput, parseEvidenceInput } from "../packages/shared/src/index.js";
import { generateReview } from "../packages/rules/src/index.js";

async function repoAt(file) {
  const repo = new FileRepository(file);
  await repo.init();
  return repo;
}

test("file repository persists facilities, evidence, and reviews after reinitialization", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ciq-repo-"));
  const file = path.join(dir, "db.json");
  const repo = await repoAt(file);
  const org = await repo.createOrganization({ name: "Tenant A" });
  const user = await repo.createUser({ organizationId: org.id, email: "a@example.com", passwordHash: "hash", name: "A", role: "admin", isActive: true });
  const facility = await repo.createFacility(parseFacilityInput({
    name: "Plant A",
    country: "US",
    stateProvince: "MI",
    region: "MI",
    industry: "industrial_manufacturing",
    facilityType: "fabrication",
    employeeCount: 55,
    hazardProfile: { machinery: true, lockoutTagout: true }
  }, org.id));
  const evidence = await repo.createEvidence(parseEvidenceInput({
    facilityId: facility.id,
    title: "LOTO procedure",
    evidenceType: "loto_procedures",
    status: "accepted"
  }, org.id, user.id));
  const generated = generateReview({ facility, evidence: [evidence], now: new Date("2026-06-18T12:00:00Z") });
  await repo.saveApplicableRules(org.id, facility.id, generated.rulesPack.rulesPackId, generated.applicableRules);
  const review = await repo.createReview({
    organizationId: org.id,
    facilityId: facility.id,
    rulesPackId: generated.rulesPack.rulesPackId,
    country: generated.country,
    region: generated.region,
    readinessScore: generated.readinessScore,
    scoreExplanation: generated.scoreExplanation,
    summary: generated.summary,
    generatedByUserId: user.id,
    evidenceMatches: generated.evidenceMatches,
    gapRows: generated.gapRows,
    findings: generated.findings,
    actionPlan: generated.actionPlan
  });
  const packet = await repo.createAuditPacket({
    organizationId: org.id,
    facilityId: facility.id,
    reviewId: review.id,
    title: "Industrial Audit Readiness Packet",
    fileReference: "packet.pdf",
    generatedByUserId: user.id,
    country: facility.country,
    region: facility.region,
    rulesPackId: generated.rulesPack.rulesPackId,
    status: "generated"
  });

  const restarted = await repoAt(file);
  assert.equal((await restarted.listFacilities(org.id))[0].id, facility.id);
  assert.equal((await restarted.getFacility(org.id, facility.id)).selectedRulesPackId, generated.rulesPack.rulesPackId);
  assert.equal((await restarted.listEvidence(org.id, facility.id))[0].id, evidence.id);
  assert.equal((await restarted.getReview(org.id, review.id)).readinessScore, generated.readinessScore);
  assert.equal((await restarted.getGapRows(org.id, review.id)).length, generated.gapRows.length);
  assert.ok((await restarted.getActionItems(org.id, review.id)).length > 0);
  assert.ok((await restarted.getEvidenceMatches(org.id, facility.id)).some((match) => match.evidenceId === evidence.id));
  assert.equal((await restarted.listAuditPackets(org.id, facility.id))[0].id, packet.id);
});

test("file repository persists sessions and rejects tenant-mismatched writes", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ciq-session-"));
  const file = path.join(dir, "db.json");
  const repo = await repoAt(file);
  const orgA = await repo.createOrganization({ name: "Tenant A" });
  const orgB = await repo.createOrganization({ name: "Tenant B" });
  const user = await repo.createUser({ organizationId: orgA.id, email: "session@example.com", passwordHash: "hash", name: "A", role: "admin", isActive: true });
  const facility = await repo.createFacility(parseFacilityInput({
    name: "Plant A",
    country: "US",
    stateProvince: "OH",
    region: "OH",
    industry: "industrial_manufacturing",
    facilityType: "fabrication",
    employeeCount: 20,
    hazardProfile: { machinery: true }
  }, orgA.id));
  const session = await repo.createSession({ organizationId: orgA.id, userId: user.id, expiresAt: "2030-01-01T00:00:00.000Z" });

  const restarted = await repoAt(file);
  assert.equal((await restarted.getSession(session.id)).userId, user.id);
  await assert.rejects(() => restarted.createSession({ organizationId: orgB.id, userId: user.id, expiresAt: "2030-01-01T00:00:00.000Z" }), /does not belong/);
  await assert.rejects(() => restarted.createEvidence(parseEvidenceInput({
    facilityId: facility.id,
    title: "Cross-tenant evidence",
    evidenceType: "loto_procedures"
  }, orgB.id, user.id)), /another organization/);
});

test("file repository invalidates a specific password reset token", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ciq-reset-invalidate-"));
  const repo = await repoAt(path.join(dir, "db.json"));
  const org = await repo.createOrganization({ name: "Tenant Reset" });
  const user = await repo.createUser({ organizationId: org.id, email: "reset@example.com", passwordHash: "hash", name: "Reset", role: "admin", isActive: true });
  const token = await repo.createPasswordResetToken({
    organizationId: org.id,
    userId: user.id,
    tokenHash: "delivery-failed-token-hash",
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  assert.equal((await repo.findValidPasswordResetToken("delivery-failed-token-hash")).id, token.id);
  const invalidated = await repo.invalidatePasswordResetToken({
    organizationId: org.id,
    userId: user.id,
    tokenHash: "delivery-failed-token-hash",
    invalidatedAt: "2026-07-10T19:00:00.000Z"
  });
  assert.equal(invalidated.id, token.id);
  assert.equal(await repo.findValidPasswordResetToken("delivery-failed-token-hash"), null);
  assert.equal(await repo.invalidatePasswordResetToken({
    organizationId: org.id,
    userId: user.id,
    tokenHash: "delivery-failed-token-hash"
  }), null);
});

test("repository blocks cross-organization access", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ciq-scope-"));
  const repo = await repoAt(path.join(dir, "db.json"));
  const orgA = await repo.createOrganization({ name: "Tenant A" });
  const orgB = await repo.createOrganization({ name: "Tenant B" });
  const facility = await repo.createFacility(parseFacilityInput({
    name: "Plant A",
    country: "US",
    stateProvince: "OH",
    region: "OH",
    industry: "industrial_manufacturing",
    facilityType: "fabrication",
    employeeCount: 20,
    hazardProfile: { machinery: true }
  }, orgA.id));

  await assert.rejects(() => repo.getFacility(orgB.id, facility.id), /another organization/);
});

test("file repository enforces lifecycle legal holds, retention candidates, retry guards, and restore rules", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ciq-lifecycle-"));
  const repo = await repoAt(path.join(dir, "db.json"));
  const org = await repo.createOrganization({ name: "Tenant A" });
  const user = await repo.createUser({ organizationId: org.id, email: "lifecycle@example.com", passwordHash: "hash", name: "Lifecycle Admin", role: "admin", isActive: true });
  const facility = await repo.createFacility(parseFacilityInput({
    name: "Plant A",
    country: "US",
    stateProvince: "OH",
    region: "OH",
    industry: "industrial_manufacturing",
    facilityType: "fabrication",
    employeeCount: 20,
    hazardProfile: { machinery: true }
  }, org.id));

  const due = await repo.createEvidence(parseEvidenceInput({
    facilityId: facility.id,
    title: "Expired record",
    evidenceType: "other",
    retentionUntil: "2026-01-01T00:00:00.000Z"
  }, org.id, user.id));
  const held = await repo.createEvidence(parseEvidenceInput({
    facilityId: facility.id,
    title: "Held expired record",
    evidenceType: "other",
    retentionUntil: "2026-01-01T00:00:00.000Z",
    fileReference: "held.txt",
    storageDeletionStatus: "failed"
  }, org.id, user.id));

  await repo.setEvidenceLegalHold(org.id, held.id, { legalHoldReason: "Counsel review", legalHoldByUserId: user.id });
  await assert.rejects(() => repo.archiveEvidence(org.id, held.id, { deletionReason: "Cleanup" }), (error) => error.code === "LEGAL_HOLD_ACTIVE");
  await assert.rejects(() => repo.markEvidenceStorageDeletionRetried(org.id, held.id, { actorUserId: user.id, updates: { storageDeletionStatus: "deleted" } }), (error) => error.code === "LEGAL_HOLD_ACTIVE");

  const candidates = await repo.listRetentionCandidates(org.id, "2026-07-01T00:00:00.000Z");
  assert.deepEqual(candidates.evidence.map((item) => item.id), [due.id]);
  assert.equal(candidates.skippedLegalHold.evidence, 1);

  await repo.archiveEvidence(org.id, due.id, {
    deletedAt: "2026-07-01T00:00:00.000Z",
    deletedByUserId: user.id,
    deletionReason: "Metadata cleanup",
    storageDeletionStatus: "not_applicable"
  });
  const restored = await repo.restoreEvidence(org.id, due.id, { restoredByUserId: user.id, restoreReason: "Metadata archived by mistake" });
  assert.equal(restored.archived, false);
  assert.equal(restored.restoreReason, "Metadata archived by mistake");

  await repo.releaseEvidenceLegalHold(org.id, held.id, { legalHoldReleasedByUserId: user.id, legalHoldReleaseReason: "Counsel cleared" });
  await repo.archiveEvidence(org.id, held.id, {
    deletedAt: "2026-07-02T00:00:00.000Z",
    deletedByUserId: user.id,
    deletionReason: "Private object deleted",
    storageDeletionStatus: "deleted"
  });
  await assert.rejects(() => repo.restoreEvidence(org.id, held.id, { restoredByUserId: user.id, restoreReason: "Cannot restore private file" }), (error) => error.code === "PRIVATE_OBJECT_DELETED");

  const generated = generateReview({ facility, evidence: [restored], now: new Date("2026-06-18T12:00:00Z") });
  const review = await repo.createReview({
    organizationId: org.id,
    facilityId: facility.id,
    rulesPackId: generated.rulesPack.rulesPackId,
    country: generated.country,
    region: generated.region,
    readinessScore: generated.readinessScore,
    scoreExplanation: generated.scoreExplanation,
    summary: generated.summary,
    generatedByUserId: user.id,
    evidenceMatches: generated.evidenceMatches,
    gapRows: generated.gapRows,
    findings: generated.findings,
    actionPlan: generated.actionPlan
  });
  const packet = await repo.createAuditPacket({
    organizationId: org.id,
    facilityId: facility.id,
    reviewId: review.id,
    title: "Packet",
    fileReference: "packet.pdf",
    generatedByUserId: user.id,
    country: facility.country,
    region: facility.region,
    rulesPackId: generated.rulesPack.rulesPackId,
    status: "generated",
    retentionUntil: "2026-01-01T00:00:00.000Z",
    storageDeletionStatus: "failed"
  });

  await repo.setAuditPacketLegalHold(org.id, packet.id, { legalHoldReason: "Regulator request", legalHoldByUserId: user.id });
  const heldPackets = await repo.listRetentionCandidates(org.id, "2026-07-01T00:00:00.000Z");
  assert.equal(heldPackets.auditPackets.length, 0);
  assert.equal(heldPackets.skippedLegalHold.auditPackets, 1);
  await assert.rejects(() => repo.markAuditPacketStorageDeletionRetried(org.id, packet.id, { actorUserId: user.id, updates: { storageDeletionStatus: "deleted" } }), (error) => error.code === "LEGAL_HOLD_ACTIVE");
  await repo.releaseAuditPacketLegalHold(org.id, packet.id, { legalHoldReleasedByUserId: user.id, legalHoldReleaseReason: "Regulator released" });
  const retriedPacket = await repo.markAuditPacketStorageDeletionRetried(org.id, packet.id, {
    actorUserId: user.id,
    updates: {
      archived: true,
      removeFileReference: true,
      deletedAt: "2026-07-01T00:00:00.000Z",
      deletedByUserId: user.id,
      deletionReason: "Retry cleanup",
      storageDeletionStatus: "deleted"
    }
  });
  assert.equal(retriedPacket.archived, true);
  assert.equal(retriedPacket.fileReference, null);
  assert.equal(retriedPacket.storageDeletionRetryCount, 1);
});
