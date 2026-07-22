import { expect, test } from "@playwright/test";

/**
 * Denied execution: the app's policy denies restricted executions outright —
 * the agent path surfaces POLICY_DENIED instead of running, proven through
 * the DevTools runner.
 */
test("policy denies restricted actions with POLICY_DENIED", async ({
  page,
}) => {
  await page.goto("/portal/invoices/inv-1001");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("button", { name: /portal\.invoice/ }).click();

  await page
    .getByRole("combobox", { name: "Action" })
    .selectOption("write-off");
  await page.getByLabel("Action input JSON").fill("{}");
  await page.getByRole("button", { name: "Prepare" }).click();

  await expect(page.getByText(/POLICY_DENIED/).first()).toBeVisible();
  await expect(
    page.getByText(/exceeds the executable maximum/).first(),
  ).toBeVisible();
});
