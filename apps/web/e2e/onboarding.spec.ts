import { expect, test } from "@playwright/test";

/**
 * The agent-as-helper pattern: the assistant fills a REAL react-hook-form
 * through the same form state the human edits — fields visibly populate,
 * the human stays in charge, and "do not submit" is honoured.
 */
test("assistant fills the onboarding form and saves a draft without submitting", async ({
  page,
}) => {
  await page.goto("/examples/onboarding");
  await page.getByRole("button", { name: "Open assistant" }).click();

  // Nothing to recommend yet: the form is empty and untouched.
  await expect(page.getByTestId("assistant-suggestion")).toHaveCount(0);

  await page
    .getByLabel("Assistant instruction")
    .fill(
      "Prepare an onboarding record for Northshore Limited — company number 09876543, UK, 1 Harbour Street, London EC2A 4BX, contact Maya Chen (maya@northshore.example). Save a draft but do not submit.",
    );
  await page.getByRole("button", { name: "Send", exact: true }).click();

  // The real form fields were filled through form state.
  await expect(page.getByLabel("Company name")).toHaveValue(
    "Northshore Limited",
  );
  await expect(page.getByLabel("Company number")).toHaveValue("09876543");
  await expect(page.getByLabel("Postcode")).toHaveValue("EC2A 4BX");
  await expect(page.getByLabel("Contact email")).toHaveValue(
    "maya@northshore.example",
  );

  // Draft saved, NOT submitted — the human stays in charge.
  await expect(page.getByTestId("onboarding-status")).toContainText(
    "Draft saved",
  );
  await expect(page.getByTestId("onboarding-status")).not.toContainText(
    "Submitted",
  );

  // Recommendations re-evaluated as the data filled in: the form is now
  // valid, so submitting is the suggested next step.
  await expect(page.getByTestId("assistant-suggestion")).toContainText(
    "Submit onboarding",
  );

  // The human can still edit the agent-filled form…
  await page.getByLabel("City").fill("Manchester");
  await expect(page.getByLabel("City")).toHaveValue("Manchester");

  // …and submit it themselves.
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByTestId("onboarding-status")).toContainText(
    "Submitted",
  );
});
