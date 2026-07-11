import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  decryptMfaSecret,
  encryptMfaSecret,
  generateMfaChallengeToken,
  generateMfaRecoveryCodes,
  hashMfaChallengeToken,
  hashMfaRecoveryCode
} from "../apps/api/src/security.js";

test("MFA AES-256-GCM encryption round-trips and rejects tampering", () => {
  const key = randomBytes(32);
  const otherKey = randomBytes(32);
  const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
  const first = encryptMfaSecret(secret, key);
  const second = encryptMfaSecret(secret, key);

  assert.notEqual(first.ciphertext, secret);
  assert.notEqual(first.iv, second.iv);
  assert.equal(decryptMfaSecret(first, key), secret);
  assert.throws(() => decryptMfaSecret({ ...first, ciphertext: `${first.ciphertext.slice(0, -1)}A` }, key));
  assert.throws(() => decryptMfaSecret({ ...first, tag: `${first.tag.slice(0, -1)}A` }, key));
  assert.throws(() => decryptMfaSecret(first, otherKey));
});

test("MFA challenge tokens and recovery codes are random and hash-only friendly", () => {
  const token = generateMfaChallengeToken();
  assert.ok(token.length >= 40);
  assert.notEqual(hashMfaChallengeToken(token), token);

  const codes = generateMfaRecoveryCodes(10);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) {
    assert.match(code, /^[A-Z0-9_-]{5}-[A-Z0-9_-]{5}-[A-Z0-9_-]{5}-[A-Z0-9_-]{5}$/);
    assert.notEqual(hashMfaRecoveryCode(code), code);
    assert.equal(hashMfaRecoveryCode(code), hashMfaRecoveryCode(code.toLowerCase().replaceAll("-", " ")));
  }
});
