import { expect, test } from "@playwright/test";

const INSTRUCTION =
  "Create a Sterling institutional share class under Global Credit Fund II. Inherit the product configuration, change the minimum subscription to £5 million, apply the institutional fee schedule, attach the latest supplement, run compliance validation, send it to Sarah for approval, and publish it to the Apollo and Wilshire workspaces once approved.";

test("the publication chain runs with navigation, approvals, and partial failure", async ({
  page,
}) => {
  await page.goto("/portal");
  await page.getByRole("button", { name: "Open assistant" }).click();
  await page.getByLabel("Assistant instruction").fill(INSTRUCTION);
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(page).toHaveURL(/portal\/products/);
  const card = page.getByTestId("share-class-sc-1");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("sc-1-minimum")).toHaveText("£5,000,000");
  await expect(card).toContainText("validation passed");

  const approvalCard = page.getByTestId("confirmation-card");
  await expect(approvalCard).toContainText(
    "Approve Sterling Institutional as Sarah",
  );
  await approvalCard.getByRole("button", { name: "Confirm" }).click();

  await expect(page.getByTestId("confirmation-card")).toContainText(
    "Publish Sterling Institutional to Apollo and Wilshire",
  );
  await page
    .getByTestId("confirmation-card")
    .getByRole("button", { name: "Confirm" })
    .click();

  await expect(card).toContainText("Apollo ✓");
  await expect(card).toContainText("Wilshire ✗");
  await expect(page.getByTestId("sc-1-failure")).toContainText(
    "Wilshire rejected the publication",
  );
  await expect(page.getByTestId("assistant-messages")).toContainText(
    "wilshire FAILED",
  );
});

test("declining the approval stops the chain before publication", async ({
  page,
}) => {
  await page.goto("/portal/products");
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
  await expect(card).toContainText("pending: Sarah");
  await expect(card).not.toContainText("Apollo ✓");
});
