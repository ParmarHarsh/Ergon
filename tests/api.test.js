import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

test("API requires auth and blocks cross-organization access", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ciq-api-"));
  process.env.NODE_ENV = "test";
  process.env.REPOSITORY_BACKEND = "file";
  process.env.FILE_REPOSITORY_PATH = path.join(dir, "db.json");
  process.env.UPLOAD_DIR = path.join(dir, "private-storage");
  process.env.STORAGE_BACKEND = process.env.API_TEST_USE_S3 === "true" ? "s3" : "local";
  if (process.env.API_TEST_USE_S3 === "true") {
    process.env.S3_BUCKET = process.env.TEST_S3_BUCKET;
    process.env.S3_REGION = process.env.TEST_S3_REGION;
    process.env.S3_ENDPOINT = process.env.TEST_S3_ENDPOINT || "";
    process.env.S3_ACCESS_KEY_ID = process.env.TEST_S3_ACCESS_KEY_ID || "";
    process.env.S3_SECRET_ACCESS_KEY = process.env.TEST_S3_SECRET_ACCESS_KEY || "";
    process.env.S3_FORCE_PATH_STYLE = process.env.TEST_S3_FORCE_PATH_STYLE || "false";
  }
  process.env.MAX_UPLOAD_MB = "5";
  process.env.SESSION_SECRET = "test-session-secret-with-enough-length";
  process.env.AI_ENABLED = "true";
  process.env.AI_PROVIDER = "mock";
  process.env.AI_CONFIDENCE_THRESHOLD = "0.8";
  process.env.AI_REVIEW_REQUIRED_THRESHOLD = "0.7";
  process.env.MALWARE_SCAN_ENABLED = "true";
  process.env.MALWARE_SCANNER_PROVIDER = "mock";
  process.env.QUEUE_MAX_RETRIES = "2";

  const { server, repo, processingQueue } = await import("../apps/api/src/server.js");
  const { hashPassword } = await import("../apps/api/src/security.js");
  const { parseEvidenceInput } = await import("../packages/shared/src/index.js");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    const orgA = await repo.createOrganization({ name: "Tenant A" });
    const orgB = await repo.createOrganization({ name: "Tenant B" });
    const user = await repo.createUser({ organizationId: orgA.id, email: "admin@example.com", passwordHash: await hashPassword("Password#2026"), name: "Admin", role: "admin", isActive: true });
    const viewer = await repo.createUser({ organizationId: orgA.id, email: "viewer@example.com", passwordHash: await hashPassword("Password#2026"), name: "Viewer", role: "compliance_manager", isActive: true });
    const userB = await repo.createUser({ organizationId: orgB.id, email: "other@example.com", passwordHash: await hashPassword("Password#2026"), name: "Other Admin", role: "admin", isActive: true });
    const facility = await repo.createFacility({
      organizationId: orgA.id,
      name: "Plant A",
      country: "US",
      stateProvince: "OH",
      region: "OH",
      jurisdictionCode: "US-OH",
      industry: "industrial_manufacturing",
      facilityType: "fabrication",
      employeeCount: 50,
      hazardProfile: { machinery: true, lockoutTagout: true },
      archived: false
    });
    const otherFacility = await repo.createFacility({
      organizationId: orgB.id,
      name: "Other Plant",
      country: "US",
      stateProvince: "TX",
      region: "TX",
      jurisdictionCode: "US-TX",
      industry: "industrial_manufacturing",
      facilityType: "fabrication",
      employeeCount: 12,
      hazardProfile: { machinery: true },
      archived: false
    });

    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).persistence.backend, "file");
    assert.equal(health.headers.get("x-content-type-options"), "nosniff");
    assert.equal(health.headers.get("x-frame-options"), "DENY");
    assert.ok(health.headers.get("content-security-policy").includes("frame-ancestors 'none'"));
    assert.ok(health.headers.get("x-request-id"));
    assert.equal((await fetch(`${base}/health/live`)).status, 200);
    assert.equal((await fetch(`${base}/health/ready`)).status, 200);

    const unauth = await fetch(`${base}/api/facilities`);
    assert.equal(unauth.status, 401);

    const rejectedOrigin = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
      body: JSON.stringify({ email: user.email, password: "Password#2026" })
    });
    assert.equal(rejectedOrigin.status, 403);

    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: "Password#2026" })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];

    const rulesPack = await fetch(`${base}/api/rules-packs/us-industrial-manufacturing-starter`, { headers: { cookie } });
    assert.equal(rulesPack.status, 200);

    const oversized = await fetch(`${base}/api/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ facilityId: facility.id, title: "Oversized", evidenceType: "loto_procedures", description: "x".repeat(1024 * 1024) })
    });
    assert.equal(oversized.status, 413);

    const invalidUpload = await fetch(`${base}/api/evidence/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ facilityId: facility.id, title: "Invalid upload", evidenceType: "loto_procedures", contentBase64: "not base64" })
    });
    assert.equal(invalidUpload.status, 400);

    const dangerousUpload = await fetch(`${base}/api/evidence/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ facilityId: facility.id, title: "Active content", evidenceType: "other", fileName: "evidence.txt", contentType: "text/plain", contentBase64: Buffer.from("<!doctype html><script>alert(1)</script>").toString("base64") })
    });
    assert.equal(dangerousUpload.status, 415);
    assert.equal((await dangerousUpload.json()).code, "ACTIVE_CONTENT_NOT_ALLOWED");

    const denied = await fetch(`${base}/api/facilities/${otherFacility.id}`, { headers: { cookie } });
    assert.equal(denied.status, 403);

    const upload = await fetch(`${base}/api/evidence/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        facilityId: facility.id,
        title: "LOTO procedure",
        evidenceType: "loto_procedures",
        status: "pending",
        contentBase64: Buffer.from("loto procedure").toString("base64"),
        fileName: "loto.txt"
      })
    });
    assert.equal(upload.status, 201);
    const evidence = await upload.json();
    assert.equal(evidence.scanStatus, "scan_clean");
    assert.equal(evidence.processingJob.status, "queued");
    assert.equal(evidence.aiAnalysis, undefined);

    await processingQueue.drain();

    assert.equal((await fetch(`${base}/api/evidence/${evidence.id}/process-ai`, { method: "POST" })).status, 401);
    const analysisResponse = await fetch(`${base}/api/evidence/${evidence.id}/ai-analysis`, { headers: { cookie } });
    assert.equal(analysisResponse.status, 200);
    const initialAnalysis = await analysisResponse.json();
    assert.equal(initialAnalysis.needsHumanReview, false);
    assert.equal(initialAnalysis.provider, "mock");
    assert.equal(initialAnalysis.analysisVersion, 1);
    assert.match(initialAnalysis.contentHash, /^[a-f0-9]{64}$/);
    assert.match(initialAnalysis.outputHash, /^[a-f0-9]{64}$/);

    const reprocess = await fetch(`${base}/api/evidence/${evidence.id}/process-ai`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: "{}" });
    assert.equal(reprocess.status, 202);
    await processingQueue.drain();
    const history = await fetch(`${base}/api/evidence/${evidence.id}/ai-analyses`, { headers: { cookie } });
    assert.equal(history.status, 200);
    assert.deepEqual((await history.json()).map((item) => item.analysisVersion), [2, 1]);

    const acceptClassification = await fetch(`${base}/api/evidence/${evidence.id}/ai-review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ action: "accept_ai", notes: "Classification reviewed." })
    });
    assert.equal(acceptClassification.status, 200);
    const markAccepted = await fetch(`${base}/api/evidence/${evidence.id}/ai-review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ action: "mark_accepted", notes: "Evidence reviewed and accepted for this packet." })
    });
    assert.equal(markAccepted.status, 200);

    const evidenceDownload = await fetch(`${base}/api/evidence/${evidence.id}/download`, { headers: { cookie } });
    assert.equal(evidenceDownload.status, 200);
    assert.equal(await evidenceDownload.text(), "loto procedure");

    const generated = await fetch(`${base}/api/audit-readiness/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ facilityId: facility.id })
    });
    assert.equal(generated.status, 201);
    const generatedBody = await generated.json();
    assert.ok(generatedBody.review.scoreExplanation.length > 0);
    assert.equal((await repo.getFacility(orgA.id, facility.id)).selectedRulesPackId, "us-industrial-manufacturing-starter");
    assert.ok((await repo.getEvidenceMatches(orgA.id, facility.id)).some((match) => match.evidenceId === evidence.id));

    const packetExport = await fetch(`${base}/api/audit-packets/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ reviewId: generatedBody.review.id })
    });
    assert.equal(packetExport.status, 201);
    const { packet } = await packetExport.json();

    const packetDownload = await fetch(`${base}/api/audit-packets/${packet.id}/download`, { headers: { cookie } });
    assert.equal(packetDownload.status, 200);
    const packetBuffer = Buffer.from(await packetDownload.arrayBuffer());
    assert.equal(packetBuffer.byteLength > 4, true);
    assert.match(packetBuffer.toString("utf8"), /AI-assisted evidence analysis/);

    assert.equal((await fetch(`${base}/api/evidence/${evidence.id}/download`)).status, 401);
    assert.equal((await fetch(`${base}/api/audit-packets/${packet.id}/download`)).status, 401);

    const loginB = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userB.email, password: "Password#2026" })
    });
    assert.equal(loginB.status, 200);
    const cookieB = loginB.headers.get("set-cookie").split(";")[0];

    const loginViewer = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: viewer.email, password: "Password#2026" })
    });
    const viewerCookie = loginViewer.headers.get("set-cookie").split(";")[0];
    const deniedReview = await fetch(`${base}/api/evidence/${evidence.id}/ai-review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: viewerCookie },
      body: JSON.stringify({ action: "mark_rejected" })
    });
    assert.equal(deniedReview.status, 403);
    assert.equal((await fetch(`${base}/api/evidence-review-queue?facilityId=${facility.id}`, { headers: { cookie: viewerCookie } })).status, 403);

    const deniedEvidence = await fetch(`${base}/api/evidence/${evidence.id}/download`, { headers: { cookie: cookieB } });
    assert.equal(deniedEvidence.status, 403);
    const deniedPacket = await fetch(`${base}/api/audit-packets/${packet.id}/download`, { headers: { cookie: cookieB } });
    assert.equal(deniedPacket.status, 403);
    assert.equal((await fetch(`${base}/api/evidence/${evidence.id}`, { method: "DELETE", headers: { cookie: cookieB } })).status, 403);
    assert.equal((await fetch(`${base}/api/audit-packets/${packet.id}`, { method: "DELETE", headers: { cookie: cookieB } })).status, 403);
    const deniedGapMatrix = await fetch(`${base}/api/audit-readiness/reviews/${generatedBody.review.id}/gap-matrix`, { headers: { cookie: cookieB } });
    assert.equal(deniedGapMatrix.status, 403);
    const deniedAuditLogs = await fetch(`${base}/api/audit-logs?facilityId=${facility.id}`, { headers: { cookie: cookieB } });
    assert.equal(deniedAuditLogs.status, 403);
    const deniedAnalysis = await fetch(`${base}/api/evidence/${evidence.id}/ai-analysis`, { headers: { cookie: cookieB } });
    assert.equal(deniedAnalysis.status, 403);
    const auditLogs = await repo.listAuditLogs(orgA.id, facility.id);
    assert.ok(auditLogs.some((entry) => entry.action === "evidence_processing_queued"));
    assert.ok(auditLogs.some((entry) => entry.action === "file_scan_clean"));
    assert.ok(auditLogs.some((entry) => entry.action === "ai_classification_generated"));
    assert.ok(auditLogs.some((entry) => entry.action === "human_accepted_ai_result"));
    assert.ok(auditLogs.some((entry) => entry.action === "packet_exported_with_ai_lineage"));
    assert.ok(auditLogs.some((entry) => entry.action === "evidence_upload_rejected"));

    const holdEvidence = await fetch(`${base}/api/evidence/${evidence.id}/legal-hold`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ reason: "Counsel review" })
    });
    assert.equal(holdEvidence.status, 200);
    assert.equal((await holdEvidence.json()).legalHoldActive, true);
    const viewerHold = await fetch(`${base}/api/evidence/${evidence.id}/legal-hold`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: viewerCookie },
      body: JSON.stringify({ reason: "Viewer attempt" })
    });
    assert.equal(viewerHold.status, 403);
    assert.equal((await fetch(`${base}/api/evidence/${evidence.id}?reason=Held`, { method: "DELETE", headers: { cookie } })).status, 409);
    const releaseEvidenceHold = await fetch(`${base}/api/evidence/${evidence.id}/legal-hold`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ reason: "Counsel cleared" })
    });
    assert.equal(releaseEvidenceHold.status, 200);
    assert.equal((await releaseEvidenceHold.json()).legalHoldActive, false);

    const holdPacket = await fetch(`${base}/api/audit-packets/${packet.id}/legal-hold`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ reason: "Audit response freeze" })
    });
    assert.equal(holdPacket.status, 200);
    assert.equal((await holdPacket.json()).legalHoldActive, true);
    assert.equal((await fetch(`${base}/api/audit-packets/${packet.id}?reason=Held`, { method: "DELETE", headers: { cookie } })).status, 409);
    const releasePacketHold = await fetch(`${base}/api/audit-packets/${packet.id}/legal-hold`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ reason: "Audit response released" })
    });
    assert.equal(releasePacketHold.status, 200);
    assert.equal((await releasePacketHold.json()).legalHoldActive, false);

    const retryUpload = await fetch(`${base}/api/evidence/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        facilityId: facility.id,
        title: "Retry deletion evidence",
        evidenceType: "other",
        contentBase64: Buffer.from("retry me").toString("base64"),
        fileName: "retry.txt"
      })
    });
    assert.equal(retryUpload.status, 201);
    const retryEvidence = await retryUpload.json();
    await repo.updateEvidence(orgA.id, retryEvidence.id, { storageDeletionStatus: "failed", storageDeletionError: "simulated prior storage outage" });
    const retryDelete = await fetch(`${base}/api/evidence/${retryEvidence.id}/retry-storage-deletion`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ reason: "Retry after storage recovery" })
    });
    assert.equal(retryDelete.status, 200);
    const retriedEvidence = await retryDelete.json();
    assert.equal(retriedEvidence.archived, true);
    assert.equal(retriedEvidence.storageDeletionStatus, "deleted");
    assert.equal(retriedEvidence.fileReference, null);
    assert.equal(retriedEvidence.storageDeletionRetryCount, 1);

    const restoreDeleted = await fetch(`${base}/api/evidence/${retryEvidence.id}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ reason: "Restore deleted file" })
    });
    assert.equal(restoreDeleted.status, 409);

    const dueEvidence = await repo.createEvidence(parseEvidenceInput({
      facilityId: facility.id,
      title: "Expired metadata evidence",
      evidenceType: "other",
      retentionUntil: "2026-01-01T00:00:00.000Z"
    }, orgA.id, user.id));
    const heldDueEvidence = await repo.createEvidence(parseEvidenceInput({
      facilityId: facility.id,
      title: "Held expired evidence",
      evidenceType: "other",
      retentionUntil: "2026-01-01T00:00:00.000Z"
    }, orgA.id, user.id));
    await repo.setEvidenceLegalHold(orgA.id, heldDueEvidence.id, { legalHoldReason: "Matter open", legalHoldByUserId: user.id });
    const retention = await fetch(`${base}/api/lifecycle/retention/enforce`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ reason: "Pilot retention sweep", dueAt: "2026-07-01T00:00:00.000Z" })
    });
    assert.equal(retention.status, 200);
    const retentionSummary = await retention.json();
    assert.equal(retentionSummary.considered, 2);
    assert.equal(retentionSummary.skippedDueLegalHold, 1);
    assert.equal(retentionSummary.archived, 1);
    assert.equal((await repo.getEvidence(orgA.id, dueEvidence.id)).archived, true);
    assert.equal((await repo.getEvidence(orgA.id, heldDueEvidence.id)).archived, false);

    const packetDelete = await fetch(`${base}/api/audit-packets/${packet.id}?reason=Pilot%20cleanup`, { method: "DELETE", headers: { cookie } });
    assert.equal(packetDelete.status, 200);
    const deletedPacket = await packetDelete.json();
    assert.equal(deletedPacket.archived, true);
    assert.equal(deletedPacket.storageDeletionStatus, "retained");
    assert.ok(deletedPacket.fileReference);
    assert.equal((await fetch(`${base}/api/audit-packets/${packet.id}/download`, { headers: { cookie } })).status, 410);

    const evidenceDelete = await fetch(`${base}/api/evidence/${evidence.id}?reason=Pilot%20cleanup`, { method: "DELETE", headers: { cookie } });
    assert.equal(evidenceDelete.status, 200);
    const deletedEvidence = await evidenceDelete.json();
    assert.equal(deletedEvidence.archived, true);
    assert.equal(deletedEvidence.storageDeletionStatus, "retained");
    assert.ok(deletedEvidence.fileReference);
    const restoredEvidenceResponse = await fetch(`${base}/api/evidence/${evidence.id}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ reason: "Archive restore proof" })
    });
    assert.equal(restoredEvidenceResponse.status, 200);
    assert.equal((await restoredEvidenceResponse.json()).archived, false);
    const deletionLogs = await repo.listAuditLogs(orgA.id, facility.id);
    assert.ok(deletionLogs.some((entry) => entry.action === "packet.archived"));
    assert.ok(deletionLogs.some((entry) => entry.action === "evidence.archived"));
    await processingQueue.stop();
    assert.equal((await fetch(`${base}/health/ready`)).status, 503);
    assert.equal((await fetch(`${base}/health/live`)).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
