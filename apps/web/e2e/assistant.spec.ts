import { expect, test } from "@playwright/test";

/**
 * The Phase-6 acceptance flow through the shipped floating widget, using the
 * deterministic demo adapter (NEXT_PUBLIC_AGENTFACE_MOCK=1 in the Playwright
 * web server): a natural-language instruction chains two actions, with the
 * send gated on an explicit user confirmation card. No real model in CI.
 */
const INSTRUCTION =
  "Add a £100 consulting line item and prepare the invoice for sending.";

test("assistant widget runs the multi-action instruction with confirmation", async ({
  page,
}) => {
  await page.goto("/examples/invoice");
  await expect(page.getByTestId("invoice-status")).toHaveText("draft");
  await expect(page.getByTestId("invoice-total")).toHaveText("£4,800");

  await page.getByRole("button", { name: "Open assistant" }).click();

  // Suggestions from the mounted surface appear as chips.
  await expect(page.getByTestId("assistant-suggestion").first()).toBeVisible();

  await page.getByLabel("Assistant instruction").fill(INSTRUCTION);
  await page.getByRole("button", { name: "Send", exact: true }).click();

  // The add-line-item action executed without confirmation…
  await expect(page.getByTestId("invoice-total")).toHaveText("£4,900");

  // …but the send pauses on a confirmation card showing the preview.
  const card = page.getByTestId("confirmation-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Send INV-9821");
  await expect(page.getByTestId("invoice-status")).toHaveText("draft");

  await card.getByRole("button", { name: "Confirm" }).click();

  await expect(page.getByTestId("invoice-status")).toHaveText("sent");
  await expect(page.getByTestId("assistant-messages")).toContainText(
    "the invoice was sent after your confirmation",
  );
});

test("declining the confirmation leaves the invoice unsent", async ({
  page,
}) => {
  await page.goto("/examples/invoice");
  await page.getByRole("button", { name: "Open assistant" }).click();
  await page.getByLabel("Assistant instruction").fill(INSTRUCTION);
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const card = page.getByTestId("confirmation-card");
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Decline" }).click();

  await expect(page.getByTestId("invoice-status")).toHaveText("draft");
  await expect(page.getByTestId("assistant-messages")).toContainText(
    "the invoice was not sent",
  );
});
