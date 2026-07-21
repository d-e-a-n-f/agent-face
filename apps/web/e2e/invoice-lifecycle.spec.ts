import { expect, test } from "@playwright/test";

/**
 * The DevTools lifecycle proof, against the Portal's seeded draft invoice
 * (INV-1001 for Wilshire Group): discovery, resource read, preparation,
 * preview, confirmation gate, execution, state update, and trace — no model.
 */
test("full invoice lifecycle through DevTools", async ({ page }) => {
  await page.goto("/portal/invoices/inv-1001");
  await expect(page.getByTestId("invoice-status")).toHaveText("draft");

  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /portal\.invoice/ }),
  ).toBeVisible();
  // Select the invoice surface (navigation/knowledge surfaces are also mounted).
  await page.getByRole("button", { name: /portal\.invoice/ }).click();

  await page.getByRole("button", { name: "Read Invoice summary" }).click();
  await expect(page.getByText('"status": "draft"')).toBeVisible();

  await page.getByRole("combobox", { name: "Action" }).selectOption("send");
  await page.getByLabel("Action input JSON").fill('{"message": "Thanks!"}');

  await page.getByRole("button", { name: "Prepare" }).click();
  await expect(page.getByText(/Send INV-1001/)).toBeVisible();
  await expect(page.getByText("confirmation required")).toBeVisible();

  await expect(page.getByRole("button", { name: "Execute" })).toBeDisabled();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("button", { name: "Execute" })).toBeEnabled();

  await page.getByRole("button", { name: "Execute" }).click();
  await expect(page.getByText("succeeded", { exact: true })).toBeVisible();
  await expect(page.getByTestId("invoice-status")).toHaveText("sent");

  await page.getByRole("button", { name: "Read Invoice summary" }).click();
  await expect(page.getByText('"status": "sent"')).toBeVisible();

  for (const eventType of [
    "action.prepared",
    "action.confirmed",
    "action.succeeded",
  ]) {
    await expect(page.getByText(eventType).first()).toBeVisible();
  }
});

test("a prepared send goes stale when the invoice changes first", async ({
  page,
}) => {
  await page.goto("/portal/invoices/inv-1001");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /portal\.invoice/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /portal\.invoice/ }).click();

  await page.getByRole("combobox", { name: "Action" }).selectOption("send");
  await page.getByLabel("Action input JSON").fill("{}");
  await page.getByRole("button", { name: "Prepare" }).click();
  await expect(page.getByText("confirmation required")).toBeVisible();

  // The user edits the invoice underneath the preparation.
  await page.getByTestId("add-consulting-line").click();
  await expect(page.getByTestId("invoice-total")).toHaveText("£6,000");

  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/STALE_STATE/).first()).toBeVisible();
  await expect(page.getByTestId("invoice-status")).toHaveText("draft");
});

test("counter example responds to agent actions", async ({ page }) => {
  await page.goto("/examples/counter");
  await expect(page.getByTestId("counter-value")).toHaveText("0");

  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("button", { name: /examples\.counter/ }).click();
  await page.getByRole("combobox", { name: "Action" }).selectOption("increment");
  await page.getByLabel("Action input JSON").fill('{"amount": 3}');
  await page.getByRole("button", { name: "Prepare" }).click();
  await page.getByRole("button", { name: "Execute" }).click();

  await expect(page.getByTestId("counter-value")).toHaveText("3");
});
