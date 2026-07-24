import { expect, test } from "@playwright/test";

/**
 * Agent-as-helper in the Portal: from the client list, the assistant opens
 * the prospect's onboarding form, fills it through the REAL form state
 * (useAgentForm), saves a draft, honours "do not submit" — and the
 * recommendations re-evaluate as the data fills in.
 */
test("assistant onboards a prospect across pages without submitting", async ({
  page,
}) => {
  await page.goto("/portal/clients");
  await page.getByRole("button", { name: "Assistant ✦" }).click();

  await page
    .getByLabel("Assistant instruction")
    .fill(
      "Onboard Northshore Limited — company number 09876543, UK, 1 Harbour Street, London EC2A 4BX, contact Maya Chen (maya@northshore.example). Save a draft but do not submit.",
    );
  await page.getByRole("button", { name: "Send", exact: true }).click();

  // The assistant navigated to the client's onboarding form and filled it.
  await expect(page).toHaveURL(/\/portal\/clients\/northshore\/onboarding/);
  await expect(page.getByLabel("Company number")).toHaveValue("09876543");
  await expect(page.getByLabel("Postcode")).toHaveValue("EC2A 4BX");
  await expect(page.getByLabel("Contact email")).toHaveValue(
    "maya@northshore.example",
  );

  await expect(page.getByTestId("onboarding-status")).toContainText(
    "Draft saved",
  );
  await expect(page.getByTestId("onboarding-status")).not.toContainText(
    "Submitted",
  );

  // Recommendations re-evaluated: the form is now valid → submit suggested.
  await expect(page.getByTestId("assistant-suggestion")).toContainText(
    "Submit onboarding",
  );

  // The human edits and submits themselves; submission activates the client.
  await page.getByLabel("City").fill("Manchester");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByTestId("onboarding-status")).toContainText(
    "Submitted",
  );
  await page.getByRole("link", { name: "Back to client" }).click();
  await expect(page.getByTestId("client-status")).toHaveText("active");
  await expect(page.getByTestId("client-onboarding-status")).toHaveText(
    "Submitted",
  );
});
