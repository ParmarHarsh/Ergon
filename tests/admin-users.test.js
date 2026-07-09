import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createLoginRateLimiter } from "../apps/api/src/rate-limit.js";

test("login rate limiter blocks after repeated failures and recovers after the window", () => {
  let currentTime = 1_000_000;
  const limiter = createLoginRateLimiter({ maxAttempts: 3, windowMs: 60_000, now: () => currentTime });
  const key = "127.0.0.1|user@example.com";

  assert.equal(limiter.check(key).allowed, true);
  limiter.recordFailure(key);
  limiter.recordFailure(key);
  assert.equal(limiter.check(key).allowed, true);
  limiter.recordFailure(key);
  const blocked = limiter.check(key);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);

  currentTime += 61_000;
  assert.equal(limiter.check(key).allowed, true);

  limiter.recordFailure(key);
  limiter.recordFailure(key);
  limiter.recordFailure(key);
  assert.equal(limiter.check(key).allowed, false);
  limiter.reset(key);
  assert.equal(limiter.check(key).allowed, true);
});

test("admin user management enforces RBAC, tenancy, and self-guards; login enforces rate limiting", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ciq-users-"));
  process.env.NODE_ENV = "test";
  process.env.REPOSITORY_BACKEND = "file";
  process.env.FILE_REPOSITORY_PATH = path.join(dir, "db.json");
  process.env.UPLOAD_DIR = path.join(dir, "private-storage");
  process.env.STORAGE_BACKEND = "local";
  process.env.MAX_UPLOAD_MB = "5";
  process.env.SESSION_SECRET = "test-session-secret-with-enough-length";
  process.env.AI_ENABLED = "false";
  process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = "3";
  process.env.LOGIN_RATE_LIMIT_WINDOW_MS = "60000";

  const { server, repo } = await import("../apps/api/src/server.js");
  const { hashPassword } = await import("../apps/api/src/security.js");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    const orgA = await repo.createOrganization({ name: "Tenant A" });
    const orgB = await repo.createOrganization({ name: "Tenant B" });
    const admin = await repo.createUser({ organizationId: orgA.id, email: "admin@tenant-a.example", passwordHash: await hashPassword("Password#2026!"), name: "Admin A", role: "admin", isActive: true });
    const reviewer = await repo.createUser({ organizationId: orgA.id, email: "reviewer@tenant-a.example", passwordHash: await hashPassword("Password#2026!"), name: "Reviewer A", role: "reviewer", isActive: true });
    const adminB = await repo.createUser({ organizationId: orgB.id, email: "admin@tenant-b.example", passwordHash: await hashPassword("Password#2026!"), name: "Admin B", role: "admin", isActive: true });

    const loginAs = async (email) => {
      const response = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "Password#2026!" })
      });
      assert.equal(response.status, 200);
      return response.headers.get("set-cookie").split(";")[0];
    };

    const cookie = await loginAs(admin.email);
    const reviewerCookie = await loginAs(reviewer.email);
    const cookieB = await loginAs(adminB.email);

    // Non-admin cannot manage users.
    assert.equal((await fetch(`${base}/api/users`, { headers: { cookie: reviewerCookie } })).status, 403);
    const deniedCreate = await fetch(`${base}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: reviewerCookie },
      body: JSON.stringify({ email: "x@tenant-a.example", name: "X", role: "reviewer", password: "LongPassword#1" })
    });
    assert.equal(deniedCreate.status, 403);

    // Admin creates a user in their own organization.
    const created = await fetch(`${base}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ email: "New.Member@Tenant-A.example", name: "New Member", role: "compliance_manager", password: "LongPassword#1" })
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.email, "new.member@tenant-a.example");
    assert.equal(createdBody.organizationId, orgA.id);
    assert.equal(createdBody.role, "compliance_manager");
    assert.equal(createdBody.passwordHash, undefined);

    // Duplicate email and invalid role/password are rejected.
    assert.equal((await fetch(`${base}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ email: "new.member@tenant-a.example", name: "Dup", role: "reviewer", password: "LongPassword#1" })
    })).status, 400);
    assert.equal((await fetch(`${base}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ email: "short@tenant-a.example", name: "Short", role: "reviewer", password: "short" })
    })).status, 400);
    assert.equal((await fetch(`${base}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ email: "badrole@tenant-a.example", name: "Bad", role: "superuser", password: "LongPassword#1" })
    })).status, 400);

    // Admin updates role and deactivates a user.
    const updated = await fetch(`${base}/api/users/${createdBody.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ role: "reviewer", isActive: false })
    });
    assert.equal(updated.status, 200);
    const updatedBody = await updated.json();
    assert.equal(updatedBody.role, "reviewer");
    assert.equal(updatedBody.isActive, false);

    // Deactivated users cannot log in.
    const deactivatedLogin = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new.member@tenant-a.example", password: "LongPassword#1" })
    });
    assert.equal(deactivatedLogin.status, 401);

    // Admin cannot deactivate or demote their own account.
    assert.equal((await fetch(`${base}/api/users/${admin.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ isActive: false })
    })).status, 400);
    assert.equal((await fetch(`${base}/api/users/${admin.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ role: "reviewer" })
    })).status, 400);

    // Cross-tenant updates return a safe 404.
    assert.equal((await fetch(`${base}/api/users/${createdBody.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: cookieB },
      body: JSON.stringify({ isActive: true })
    })).status, 404);

    // Audit trail recorded management actions.
    const logs = await repo.listAuditLogs(orgA.id, null);
    assert.ok(logs.some((entry) => entry.action === "user.created"));
    assert.ok(logs.some((entry) => entry.action === "user.updated"));

    // Login rate limiting: repeated failures lock the account+IP pair.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const failed = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "attacker-target@tenant-a.example", password: "wrong-password!" })
      });
      assert.equal(failed.status, 401);
    }
    const limited = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "attacker-target@tenant-a.example", password: "wrong-password!" })
    });
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).code, "RATE_LIMITED");

    // A different email from the same IP is still allowed.
    const otherEmail = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: admin.email, password: "Password#2026!" })
    });
    assert.equal(otherEmail.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
