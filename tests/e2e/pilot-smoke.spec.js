import { test, expect } from "@playwright/test";

test("closed pilot workflow validates evidence processing, review, packet, deletion, and health", async ({ page, request }) => {
  const browserErrors = [];
  const networkErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource:.*401 \(Unauthorized\)/.test(message.text())) browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400 && !(response.status() === 401 && response.url().endsWith("/api/auth/me"))) {
      networkErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.addInitScript(() => window.localStorage.setItem("ciq_api_base", "http://127.0.0.1:4100"));
  await page.goto("/");
  await expect(page).toHaveTitle(/ComplianceIQ/);
  await expect(page.locator("body")).not.toContainText("Internal Server Error");

  // Login
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
  await page.getByLabel("Email").fill("pilot-admin@complianceiq.local");
  await page.getByLabel("Password").fill("PilotPassword#2026");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Audit Packet Builder" })).toBeVisible();

  // Create facility
  await page.locator(".sidebar").getByRole("button", { name: "Facilities" }).click();
  await page.locator('#facility-form input[name="name"]').fill("Pilot Fabrication Plant");
  await page.locator('#facility-form select[name="country"]').selectOption("US");
  await page.locator('#facility-form input[name="stateProvince"]').fill("Ohio");
  await page.locator('#facility-form input[name="region"]').fill("OH");
  await page.locator('#facility-form input[name="machinery"]').check();
  await page.locator('#facility-form input[name="lockoutTagout"]').check();
  await page.getByRole("button", { name: "Create facility" }).click();
  await expect(page.locator("#facility-select")).toContainText("Pilot Fabrication Plant");

  // Upload evidence with a private file
  await page.locator(".sidebar").getByRole("button", { name: "Evidence", exact: true }).click();
  await page.locator('#evidence-form input[name="title"]').fill("Pilot LOTO procedure");
  await page.locator('#evidence-form select[name="evidenceType"]').selectOption("other");
  await page.locator('#evidence-form textarea[name="description"]').fill("Synthetic lockout tagout procedure dated 2026-04-15.");
  await page.locator('#evidence-form input[name="file"]').setInputFiles({
    name: "pilot-loto.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic lockout tagout procedure dated 2026-04-15. LOTO energy control steps.")
  });
  await page.getByRole("button", { name: "Upload or log evidence" }).click();
  const evidenceCard = page.locator(".evidence-item").filter({ hasText: "Pilot LOTO procedure" });
  await expect(evidenceCard).toBeVisible();
  await expect(evidenceCard).toContainText(/AI processed|Needs review/, { timeout: 15_000 });
  await expect(evidenceCard).toContainText("AI evidence intelligence");

  // Review queue shows the item
  await page.locator(".sidebar").getByRole("button", { name: "Review queue" }).click();
  await expect(page.locator(".review-queue-list")).toContainText("Pilot LOTO procedure");

  // Generate the gap matrix
  await page.locator(".sidebar").getByRole("button", { name: "Gap Matrix" }).click();
  await page.getByRole("button", { name: /Generate analysis|Regenerate analysis/ }).click();
  await expect(page.locator("table")).toContainText("Lockout/Tagout written procedures");

  // Row drawer opens with lineage detail
  await page.locator("tr", { hasText: "Lockout/Tagout written procedures" }).first().click();
  await expect(page.locator(".drawer")).toContainText("What this obligation requires");
  await expect(page.locator(".drawer")).toContainText("Required evidence");
  await page.keyboard.press("Escape");
  await expect(page.locator(".drawer")).toHaveCount(0);

  // Action plan lists the open gap
  await page.locator(".sidebar").getByRole("button", { name: "Action plan" }).click();
  await expect(page.locator(".bucket-grid")).toContainText("Close evidence gap: Lockout/Tagout written procedures");

  // Human review: override classification and accept the evidence
  await page.locator(".sidebar").getByRole("button", { name: "Evidence", exact: true }).click();
  const reviewForm = evidenceCard.locator("form.review-form");
  await reviewForm.locator('select[name="evidenceType"]').selectOption("loto_procedures");
  await reviewForm.locator('select[name="ruleId"]').selectOption("us-loto-procedures");
  await reviewForm.locator('textarea[name="notes"]').fill("Closed-pilot human review override.");
  await reviewForm.getByRole("button", { name: "Apply override" }).click();
  await expect(evidenceCard).toContainText("Human-reviewed");
  await evidenceCard.locator("form.review-form").getByRole("button", { name: "Mark evidence accepted" }).click();
  await expect(evidenceCard).toContainText("Evidence accepted");

  // Gap matrix reflects the accepted evidence; action plan gap is closed
  await page.locator(".sidebar").getByRole("button", { name: "Gap Matrix" }).click();
  await expect(page.locator("tr", { hasText: "Lockout/Tagout written procedures" })).toContainText("Accepted");
  await page.locator(".sidebar").getByRole("button", { name: "Action plan" }).click();
  await expect(page.locator(".bucket-grid")).not.toContainText("Close evidence gap: Lockout/Tagout written procedures");

  // Export, download, and archive the audit packet
  await page.locator(".sidebar").getByRole("button", { name: "Packet Builder" }).click();
  await page.getByRole("button", { name: "Export audit packet" }).click();
  await expect(page.getByRole("heading", { name: "Packet history" })).toBeVisible();
  await expect(page.locator("table")).toContainText("Industrial Audit Readiness Packet");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("[data-action='download-packet']").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/industrial-audit-readiness-packet/);
  await page.screenshot({ path: "/tmp/complianceiq-pilot-smoke.png", fullPage: false });

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("[data-action='archive-packet']").click();
  await expect(page.locator("main")).toContainText("No packets exported yet");

  // Archive the evidence record
  await page.locator(".sidebar").getByRole("button", { name: "Evidence", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await evidenceCard.locator("[data-action='archive-evidence']").click();
  await expect(page.locator("main")).not.toContainText("Pilot LOTO procedure");

  // Admin screen manages users
  await page.locator(".sidebar").getByRole("button", { name: "Admin" }).click();
  await expect(page.locator("table")).toContainText("pilot-admin@complianceiq.local");
  await page.locator('#user-form input[name="name"]').fill("Pilot Reviewer");
  await page.locator('#user-form input[name="email"]').fill("pilot-reviewer@complianceiq.local");
  await page.locator('#user-form input[name="password"]').fill("ReviewerPassword#2026");
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(page.locator("table")).toContainText("pilot-reviewer@complianceiq.local");

  expect((await request.get("http://127.0.0.1:4100/health/live")).status()).toBe(200);
  expect((await request.get("http://127.0.0.1:4100/health/ready")).status()).toBe(200);
  expect(browserErrors).toEqual([]);
  expect(networkErrors).toEqual([]);
});
