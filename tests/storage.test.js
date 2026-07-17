import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPrivateStorage } from "../apps/api/src/storage.js";

test("local private storage survives adapter reinitialization and blocks traversal", async () => {
  const uploadDir = await mkdtemp(path.join(os.tmpdir(), "ciq-storage-"));
  const config = { uploadStorageBackend: "local", uploadDir, maxUploadMb: 1 };
  const first = createPrivateStorage(config);
  const saved = await first.saveBuffer(Buffer.from("private evidence"), "evidence.txt");

  const restarted = createPrivateStorage(config);
  assert.equal((await restarted.readBuffer(saved.fileReference)).toString("utf8"), "private evidence");
  await assert.rejects(() => restarted.readBuffer("../outside.txt"), /Invalid private file reference/);
  await restarted.deleteBuffer(saved.fileReference);
  await assert.rejects(() => restarted.readBuffer(saved.fileReference), /ENOENT/);
});

test("S3 private storage uses opaque keys and never exposes a public URL", async () => {
  const objects = new Map();
  let putInput;
  const client = {
    async send(command) {
      if (command.constructor.name === "PutObjectCommand") {
        putInput = command.input;
        objects.set(command.input.Key, Buffer.from(command.input.Body));
        return {};
      }
      if (command.constructor.name === "HeadObjectCommand") {
        return { ContentLength: objects.get(command.input.Key)?.byteLength, ContentType: "application/pdf", ETag: '"safe-etag"' };
      }
      if (command.constructor.name === "GetObjectCommand") {
        const value = objects.get(command.input.Key);
        return { Body: { transformToByteArray: async () => value } };
      }
      if (command.constructor.name === "DeleteObjectCommand") {
        objects.delete(command.input.Key);
        return {};
      }
      throw new Error("Unexpected command");
    }
  };
  const storage = createPrivateStorage({
    storageBackend: "s3",
    maxUploadMb: 1,
    s3Bucket: "private-bucket",
    s3Region: "ca-central-1",
    s3Endpoint: "",
    s3ForcePathStyle: false,
    s3AccessKeyId: "",
    s3SecretAccessKey: ""
  }, { s3Client: client, presigner: async (_client, command, options) => `https://private.example/${command.input.Key}?X-Amz-Expires=${options.expiresIn}` });
  const saved = await storage.saveBuffer(Buffer.from("private object"), "record.pdf", {
    organizationId: "org_123", facilityId: "facility_456", resourceType: "evidence", resourceId: "evidence_789", contentType: "application/pdf"
  });
  assert.match(saved.fileReference, /^private\/org_123\/facility_456\/evidence\/evidence_789\/[a-f0-9-]+\.pdf$/);
  assert.equal(putInput.ContentType, "application/pdf");
  assert.equal("ServerSideEncryption" in putInput, false);
  assert.equal(saved.fileReference.includes("http"), false);
  assert.equal((await storage.readBuffer(saved.fileReference)).toString(), "private object");
  assert.deepEqual(await storage.statObject(saved.fileReference), { sizeBytes: 14, contentType: "application/pdf", etag: "safe-etag" });
  const signed = await storage.createSignedReadUrl(saved.fileReference, 120);
  assert.equal(new URL(signed).searchParams.get("X-Amz-Expires"), "120");
  await assert.rejects(() => storage.createSignedReadUrl(saved.fileReference, 10), /between 60 and 3600/);
  await assert.rejects(() => storage.readBuffer("../public/object"), /Invalid private object reference/);
  await storage.deleteBuffer(saved.fileReference);
  assert.equal(objects.size, 0);
});

test("S3-compatible integration uploads, retrieves, and deletes a private object", { skip: !hasS3IntegrationConfig() }, async () => {
  const storage = createPrivateStorage({
    storageBackend: "s3",
    maxUploadMb: 1,
    s3Bucket: process.env.TEST_S3_BUCKET,
    s3Region: process.env.TEST_S3_REGION,
    s3Endpoint: process.env.TEST_S3_ENDPOINT || "",
    s3ForcePathStyle: process.env.TEST_S3_FORCE_PATH_STYLE === "true",
    s3AccessKeyId: process.env.TEST_S3_ACCESS_KEY_ID || "",
    s3SecretAccessKey: process.env.TEST_S3_SECRET_ACCESS_KEY || "",
    signedUrlExpirySeconds: 120
  });
  const marker = `private-s3-integration-${Date.now()}`;
  const saved = await storage.saveBuffer(Buffer.from(marker), "integration.txt");
  try {
    assert.match(saved.fileReference, /^private\/unscoped\/[a-f0-9-]+\.txt$/);
    assert.equal(saved.fileReference.includes("http"), false);
    assert.equal((await storage.readBuffer(saved.fileReference)).toString(), marker);
    const signed = await storage.createSignedReadUrl(saved.fileReference, 120);
    assert.equal(new URL(signed).searchParams.get("X-Amz-Expires"), "120");
    const signedResponse = await fetch(signed);
    assert.equal(signedResponse.ok, true);
    assert.equal(await signedResponse.text(), marker);
    const publicResponse = await fetch(publicObjectUrl(saved.fileReference), { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    assert.notEqual(publicResponse.status, 200, "Test object is publicly readable without authorization");
  } finally {
    await storage.deleteBuffer(saved.fileReference);
  }
  await assert.rejects(() => storage.readBuffer(saved.fileReference));
});

function hasS3IntegrationConfig() {
  return Boolean(process.env.TEST_S3_BUCKET && process.env.TEST_S3_REGION
    && process.env.TEST_S3_ACCESS_KEY_ID && process.env.TEST_S3_SECRET_ACCESS_KEY);
}

function publicObjectUrl(fileReference) {
  const encodedKey = fileReference.split("/").map(encodeURIComponent).join("/");
  if (process.env.TEST_S3_ENDPOINT) {
    const endpoint = new URL(process.env.TEST_S3_ENDPOINT);
    if (process.env.TEST_S3_FORCE_PATH_STYLE === "true") {
      endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/${encodeURIComponent(process.env.TEST_S3_BUCKET)}/${encodedKey}`;
    } else {
      endpoint.hostname = `${process.env.TEST_S3_BUCKET}.${endpoint.hostname}`;
      endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/${encodedKey}`;
    }
    return endpoint.toString();
  }
  return `https://${process.env.TEST_S3_BUCKET}.s3.${process.env.TEST_S3_REGION}.amazonaws.com/${encodedKey}`;
}
