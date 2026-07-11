import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { FileRepository } from "../packages/db/src/file-repository.js";

async function repoAt(file) {
  const repo = new FileRepository(file);
  await repo.init();
  return repo;
}

test("file repository stores MFA state without plaintext and enforces single-use primitives", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ciq-mfa-repo-"));
  const repo = await repoAt(path.join(dir, "db.json"));
  const org = await repo.createOrganization({ name: "Tenant MFA" });
  const user = await repo.createUser({ organizationId: org.id, email: "mfa@example.com", passwordHash: "hash", name: "MFA", role: "admin", isActive: true });

  const pending = await repo.createPendingMfaEnrollment({
    organizationId: org.id,
    userId: user.id,
    encryptedSecret: { ciphertext: "ciphertext-only", iv: "iv-only", tag: "tag-only" },
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  assert.equal(pending.pendingSecretCiphertext, "ciphertext-only");
  assert.equal(JSON.stringify(repo.data).includes("plaintext-secret"), false);

  const confirmed = await repo.confirmMfaEnrollment({
    organizationId: org.id,
    userId: user.id,
    acceptedCounter: 10
  });
  assert.equal(confirmed.enabled, true);
  assert.equal(confirmed.secretCiphertext, "ciphertext-only");
  assert.equal(confirmed.pendingSecretCiphertext, null);
  assert.equal(await repo.updateLastAcceptedTotpCounter({ organizationId: org.id, userId: user.id, counter: 10 }), null);
  assert.equal((await repo.updateLastAcceptedTotpCounter({ organizationId: org.id, userId: user.id, counter: 11 })).lastAcceptedTotpCounter, 11);

  const challenge = await repo.createMfaLoginChallenge({
    organizationId: org.id,
    userId: user.id,
    challengeTokenHash: "challenge-hash",
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  assert.equal(challenge.challengeTokenHash, "challenge-hash");
  assert.equal(await repo.getValidMfaLoginChallengeByHash("challenge-hash"), challenge);
  await repo.recordMfaChallengeFailure({ challengeTokenHash: "challenge-hash", maxAttempts: 2 });
  const failed = await repo.recordMfaChallengeFailure({ challengeTokenHash: "challenge-hash", maxAttempts: 2 });
  assert.equal(failed.failedAttemptCount, 2);
  assert.ok(failed.invalidatedAt);
  assert.equal(await repo.consumeMfaChallenge({ challengeTokenHash: "challenge-hash" }), null);

  const fresh = await repo.createMfaLoginChallenge({
    organizationId: org.id,
    userId: user.id,
    challengeTokenHash: "fresh-challenge-hash",
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  assert.equal((await repo.consumeMfaChallenge({ challengeTokenHash: fresh.challengeTokenHash })).id, fresh.id);
  assert.equal(await repo.consumeMfaChallenge({ challengeTokenHash: fresh.challengeTokenHash }), null);

  await repo.replaceMfaRecoveryCodes({ organizationId: org.id, userId: user.id, codeHashes: ["code-hash-a", "code-hash-b"] });
  assert.equal(JSON.stringify(repo.data).includes("plain-recovery-code"), false);
  assert.equal((await repo.consumeMfaRecoveryCode({ organizationId: org.id, userId: user.id, codeHash: "code-hash-a" })).codeHash, "code-hash-a");
  assert.equal(await repo.consumeMfaRecoveryCode({ organizationId: org.id, userId: user.id, codeHash: "code-hash-a" }), null);
  await repo.replaceMfaRecoveryCodes({ organizationId: org.id, userId: user.id, codeHashes: ["code-hash-c"] });
  assert.equal(await repo.consumeMfaRecoveryCode({ organizationId: org.id, userId: user.id, codeHash: "code-hash-b" }), null);

  const reset = await repo.createPasswordResetToken({
    organizationId: org.id,
    userId: user.id,
    tokenHash: "reset-token-hash",
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  assert.equal(reset.userId, user.id);
  await repo.completePasswordReset({ tokenHash: "reset-token-hash", passwordHash: "new-hash" });
  assert.equal((await repo.getUserMfaSettings(org.id, user.id)).enabled, true);

  await repo.disableUserMfa({ organizationId: org.id, userId: user.id });
  const disabled = await repo.getUserMfaSettings(org.id, user.id);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.secretCiphertext, null);
  assert.equal(await repo.consumeMfaRecoveryCode({ organizationId: org.id, userId: user.id, codeHash: "code-hash-c" }), null);
});
