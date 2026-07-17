import { chmod, writeFile } from "node:fs/promises";
import { HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createS3Client } from "../apps/api/src/storage.js";

const required = ["S3_BUCKET", "S3_REGION", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "STORAGE_INVENTORY_OUTPUT"];
const missing = required.filter((name) => !process.env[name]);
if (process.env.ERGON_LIVE_CLOUD_VALIDATION !== "true" || missing.length) {
  process.stdout.write(`STORAGE_INVENTORY_READINESS=READY_MISSING_CLOUD_CONFIGURATION\nNo objects were listed. Missing or inactive: ${missing.join(", ") || "ERGON_LIVE_CLOUD_VALIDATION"}.\n`);
  process.exit(0);
}

const client = createS3Client({
  s3Region: process.env.S3_REGION,
  s3Endpoint: validateEndpoint(process.env.S3_ENDPOINT),
  s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID,
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY
});
const objects = [];
let continuationToken;
do {
  const page = await client.send(new ListObjectsV2Command({
    Bucket: process.env.S3_BUCKET,
    Prefix: "private/",
    ContinuationToken: continuationToken
  }));
  for (const object of page.Contents || []) {
    const head = await client.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: object.Key }));
    const scope = parseScope(object.Key);
    objects.push({
      key: object.Key,
      sizeBytes: object.Size ?? head.ContentLength ?? null,
      contentType: head.ContentType || null,
      etag: object.ETag?.replace(/^"|"$/g, "") || head.ETag?.replace(/^"|"$/g, "") || null,
      organizationId: scope.organizationId,
      facilityId: scope.facilityId,
      resourceType: scope.resourceType,
      evidenceId: scope.resourceType === "evidence" ? scope.resourceId : null,
      createdAt: object.LastModified?.toISOString() || head.LastModified?.toISOString() || null
    });
  }
  continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (continuationToken);
const output = process.env.STORAGE_INVENTORY_OUTPUT;
await writeFile(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), bucket: process.env.S3_BUCKET, prefix: "private/", count: objects.length, objects }, null, 2)}\n`, { mode: 0o600 });
await chmod(output, 0o600);
process.stdout.write(`STORAGE_INVENTORY_CREATED=${output}\nSTORAGE_OBJECT_COUNT=${objects.length}\n`);

function validateEndpoint(value) {
  const endpoint = new URL(value);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error("S3_ENDPOINT must be a safe HTTPS URL");
  return endpoint.toString().replace(/\/$/, "");
}

function parseScope(key = "") {
  const [, organizationId = null, facilityId = null, resourceType = null, resourceId = null] = key.split("/");
  return { organizationId, facilityId, resourceType, resourceId };
}
