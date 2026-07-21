import { expect, test } from "@playwright/test";

/**
 * The Phase-5 acceptance flow (MISSION.md §19): the complete invoice
 * lifecycle operated through the AgentFace DevTools panel — discovery,
 * resource read, preparation, preview, confirmation, execution, state
 * update, and trace output — with no model involved.
 */
test("full invoice lifecycle through DevTools", async ({ page }) => {
  await page.goto("/examples/invoice");
  await expect(page.getByTestId("invoice-status")).toHaveText("draft");

  // Open the DevTools panel and find the mounted invoice surface.
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /billing\.invoice/ }),
  ).toBeVisible();
  // Select the invoice surface (app.navigation is discovered first).
  await page.getByRole("button", { name: /billing\.invoice/ }).click();

  // Inspect the summary resource.
  await page.getByRole("button", { name: "Read Invoice summary" }).click();
  await expect(page.getByText('"status": "draft"')).toBeVisible();

  // Select the send action and enter valid input.
  await page.getByRole("combobox", { name: "Action" }).selectOption("send");
  await page
    .getByLabel("Action input JSON")
    .fill('{"message": "Please find the invoice attached."}');

  // Prepare: the preview and the confirmation requirement appear.
  await page.getByRole("button", { name: "Prepare" }).click();
  await expect(page.getByText(/Send INV-9821/)).toBeVisible();
  await expect(page.getByText("confirmation required")).toBeVisible();

  // Execution is blocked until the exact preparation is confirmed.
  await expect(page.getByRole("button", { name: "Execute" })).toBeDisabled();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("button", { name: "Execute" })).toBeEnabled();

  // Execute and observe the structured result and the UI state change.
  await page.getByRole("button", { name: "Execute" }).click();
  await expect(page.getByText("succeeded", { exact: true })).toBeVisible();
  await expect(page.getByTestId("invoice-status")).toHaveText("sent");

  // The updated resource reflects the new state.
  await page.getByRole("button", { name: "Read Invoice summary" }).click();
  await expect(page.getByText('"status": "sent"')).toBeVisible();

  // The complete lifecycle appears in the trace stream.
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
  await page.goto("/examples/invoice");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /billing\.invoice/ }),
  ).toBeVisible();
  // Select the invoice surface (app.navigation is discovered first).
  await page.getByRole("button", { name: /billing\.invoice/ }).click();

  // Prepare the send.
  await page.getByRole("combobox", { name: "Action" }).selectOption("send");
  await page.getByLabel("Action input JSON").fill("{}");
  await page.getByRole("button", { name: "Prepare" }).click();
  await expect(page.getByText("confirmation required")).toBeVisible();

  // The user edits the invoice underneath the preparation.
  await page.getByTestId("add-consulting-line").click();
  await expect(page.getByTestId("invoice-total")).toHaveText("£6,000");

  // Confirming the now-stale preparation is rejected with STALE_STATE.
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/STALE_STATE/).first()).toBeVisible();

  // The invoice was never sent.
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
