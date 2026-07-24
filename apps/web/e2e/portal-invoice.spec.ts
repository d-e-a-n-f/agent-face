import { expect, test } from "@playwright/test";

const INSTRUCTION =
  "Create an invoice for Wilshire Group for a £1,200 consulting day and send it.";

/**
 * The deep cross-page flow: from anywhere, the assistant opens the client,
 * creates the invoice, opens it, adds the line item, and sends — gated on
 * the user's confirmation, with the preview naming amount and recipient.
 */
test("assistant creates, fills, and sends a client invoice across pages", async ({
  page,
}) => {
  await page.goto("/portal");
  await page.getByRole("button", { name: "Assistant ✦" }).click();
  await page.getByLabel("Assistant instruction").fill(INSTRUCTION);
  await page.getByRole("button", { name: "Send", exact: true }).click();

  // The assistant navigated: client page → new invoice page.
  await expect(page).toHaveURL(/\/portal\/invoices\/inv-1002/);
  await expect(page.getByTestId("invoice-total")).toHaveText("£1,200");
  await expect(page.getByTestId("invoice-status")).toHaveText("draft");

  // Sending pauses on a confirmation card with the exact preview.
  const card = page.getByTestId("confirmation-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Send INV-1002");
  await expect(card).toContainText("billing@wilshire.example");

  await card.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByTestId("invoice-status")).toHaveText("sent");
  await expect(page.getByTestId("assistant-messages")).toContainText(
    "sent after your confirmation",
  );

  // The store persists in localStorage: a HARD reload keeps everything.
  await page.reload();
  await expect(page.getByTestId("invoice-status")).toHaveText("sent");
  await page.getByRole("link", { name: "Wilshire Group" }).click();
  await expect(page.getByRole("link", { name: "INV-1002" })).toBeVisible();
});

test("declining the send leaves the invoice a draft", async ({ page }) => {
  await page.goto("/portal/clients/wilshire");
  await page.getByRole("button", { name: "Assistant ✦" }).click();
  await page.getByLabel("Assistant instruction").fill(INSTRUCTION);
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const card = page.getByTestId("confirmation-card");
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Decline" }).click();

  await expect(page.getByTestId("invoice-status")).toHaveText("draft");
  await expect(page.getByTestId("assistant-messages")).toContainText(
    "was not sent",
  );
});
