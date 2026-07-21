import { expect, test } from "@playwright/test";

const INSTRUCTION =
  "Create a Sterling institutional share class under Global Credit Fund II. Inherit the product configuration, change the minimum subscription to £5 million, apply the institutional fee schedule, attach the latest supplement, run compliance validation, send it to Sarah for approval, and publish it to the Apollo and Wilshire workspaces once approved.";

/**
 * Phase-7 acceptance: the reference instruction end-to-end — including the
 * assistant NAVIGATING to the right screen first — with two confirmation
 * gates (approval, publication) and explicit partial failure (Wilshire is
 * degraded on purpose). Deterministic mock adapter; no model in CI.
 */
test("the reference scenario runs end-to-end with navigation, approvals, and partial failure", async ({
  page,
}) => {
  // Start on the HOME page: the assistant must navigate itself.
  await page.goto("/");
  await page.getByRole("button", { name: "Open assistant" }).click();
  await page.getByLabel("Assistant instruction").fill(INSTRUCTION);
  await page.getByRole("button", { name: "Send", exact: true }).click();

  // The assistant navigated to the publication screen and built the class.
  await expect(page).toHaveURL(/product-publication/);
  const card = page.getByTestId("share-class-sc-1");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("sc-1-minimum")).toHaveText("£5,000,000");
  await expect(card).toContainText("Institutional fees");
  await expect(card).toContainText("validation passed");

  // Gate 1: approval requires explicit confirmation, as Sarah.
  const approvalCard = page.getByTestId("confirmation-card");
  await expect(approvalCard).toBeVisible();
  await expect(approvalCard).toContainText(
    "Approve Sterling Institutional as Sarah",
  );
  await approvalCard.getByRole("button", { name: "Confirm" }).click();

  // Gate 2: publication requires explicit confirmation, naming the targets.
  await expect(page.getByTestId("confirmation-card")).toContainText(
    "Publish Sterling Institutional to Apollo and Wilshire",
  );
  await page
    .getByTestId("confirmation-card")
    .getByRole("button", { name: "Confirm" })
    .click();

  // Partial failure is explicit: Apollo published, Wilshire failed, no rollback.
  await expect(card).toContainText("Apollo ✓");
  await expect(card).toContainText("Wilshire ✗");
  await expect(page.getByTestId("sc-1-failure")).toContainText(
    "Wilshire rejected the publication",
  );
  await expect(page.getByTestId("assistant-messages")).toContainText(
    "published to apollo",
  );
  await expect(page.getByTestId("assistant-messages")).toContainText(
    "wilshire FAILED",
  );
});

test("declining the approval stops the chain before publication", async ({
  page,
}) => {
  await page.goto("/examples/product-publication");
  await page.getByRole("button", { name: "Open assistant" }).click();
  await page.getByLabel("Assistant instruction").fill(INSTRUCTION);
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const approvalCard = page.getByTestId("confirmation-card");
  await expect(approvalCard).toContainText("Approve Sterling Institutional");
  await approvalCard.getByRole("button", { name: "Decline" }).click();

  await expect(page.getByTestId("assistant-messages")).toContainText(
    "stopping there",
  );
  const card = page.getByTestId("share-class-sc-1");
  // Still pending, never approved, never published.
  await expect(card).toContainText("pending: Sarah");
  await expect(card).not.toContainText("Apollo ✓");
});

/**
 * Cross-page context: the assistant reads data on one screen, navigates,
 * and uses what it read to fill something in on another screen.
 */
test("the assistant carries context across pages to fill the invoice", async ({
  page,
}) => {
  await page.goto("/examples/customer-table");
  await page.getByRole("button", { name: "Open assistant" }).click();
  await page
    .getByLabel("Assistant instruction")
    .fill(
      "Find our highest-value active customer, then add a £1,200 consulting line item for them on the invoice.",
    );
  await page.getByRole("button", { name: "Send", exact: true }).click();

  // The assistant navigated to the invoice and used the customer it read.
  await expect(page).toHaveURL(/invoice/);
  await expect(page.getByText("Consulting for Wilshire Group")).toBeVisible();
  await expect(page.getByTestId("invoice-total")).toHaveText("£6,000");
  await expect(page.getByTestId("assistant-messages")).toContainText(
    "Wilshire Group",
  );
});
