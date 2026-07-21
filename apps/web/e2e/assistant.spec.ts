import { expect, test } from "@playwright/test";

/**
 * The Phase-6 acceptance flow with the deterministic mock adapter: a natural-
 * language instruction chains two actions through the runtime, with the send
 * gated on an explicit user confirmation card. No real model in CI.
 */
test("assistant demo runs the multi-action instruction with confirmation", async ({
  page,
}) => {
  await page.goto("/examples/invoice");
  await expect(page.getByTestId("invoice-status")).toHaveText("draft");
  await expect(page.getByTestId("invoice-total")).toHaveText("£4,800");

  await page.getByRole("button", { name: "Open assistant", exact: true }).click();
  // The demo instruction is pre-filled; the mock adapter is the default.
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
    "All done.",
  );
});

test("declining the confirmation leaves the invoice unsent", async ({
  page,
}) => {
  await page.goto("/examples/invoice");
  await page.getByRole("button", { name: "Open assistant", exact: true }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const card = page.getByTestId("confirmation-card");
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Decline" }).click();

  await expect(page.getByTestId("invoice-status")).toHaveText("draft");
});
