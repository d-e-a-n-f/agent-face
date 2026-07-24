import { expect, test } from "@playwright/test";

/**
 * The knowledge surface: "how does X work?" gets answered from the app's
 * own help articles — searched and read through typed actions, grounded,
 * with an offer to do the thing.
 */
test("assistant answers questions from the app's help content", async ({
  page,
}) => {
  await page.goto("/portal");
  await page.getByRole("button", { name: "Assistant ✦" }).click();
  await page
    .getByLabel("Assistant instruction")
    .fill("How do discounts work on invoices?");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const messages = page.getByTestId("assistant-messages");
  // Grounded in the article, not invented: quotes the 20% rule.
  await expect(messages).toContainText("Invoice discounts");
  await expect(messages).toContainText("20%");
  await expect(messages).toContainText("approval");
  // The help tools were used (visible as tool lines).
  await expect(messages).toContainText("search-help");
});
