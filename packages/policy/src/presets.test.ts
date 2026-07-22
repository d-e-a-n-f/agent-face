import { describe, expect, it } from "vitest";
import {
  denyOutsideBusinessHours,
  developmentPolicy,
  limitActionRate,
  limitMonetaryValue,
  readOnlyPolicy,
  requireRole,
  requireSameTenant,
  requireUser,
  standardUserPolicy,
} from "./presets.js";
import type { AgentPolicyRequest } from "./types.js";

const surface = {
  faceId: "billing.invoice",
  instanceId: "billing.invoice:inv_1:1",
  entity: { type: "invoice", id: "inv_1" },
} as const;

function executeRequest(
  overrides: Partial<AgentPolicyRequest> = {},
): AgentPolicyRequest {
  return {
    operation: "execute-action",
    surface,
    actionId: "send",
    ...overrides,
  };
}

const dean = { type: "user", id: "user_dean", roles: ["finance-admin"] } as const;

describe("rules", () => {
  it("requireUser denies anonymous operations and allows authenticated ones", async () => {
    const rule = requireUser();
    expect(await rule.evaluate(executeRequest())).toMatchObject({
      effect: "deny",
      code: "unauthenticated",
    });
    expect(await rule.evaluate(executeRequest({ user: dean }))).toBeUndefined();
  });

  it("requireRole reads the user principal's roles by default", async () => {
    const rule = requireRole("finance-admin", { forActions: ["send"] });
    expect(await rule.evaluate(executeRequest({ user: dean }))).toBeUndefined();
    expect(
      await rule.evaluate(
        executeRequest({ user: { type: "user", id: "u2", roles: [] } }),
      ),
    ).toMatchObject({ effect: "deny", code: "role-missing" });
    // Other actions are not gated:
    expect(
      await rule.evaluate(
        executeRequest({
          user: { type: "user", id: "u2", roles: [] },
          actionId: "save-draft",
        }),
      ),
    ).toBeUndefined();
  });

  it("requireSameTenant compares user and entity tenants", async () => {
    const rule = requireSameTenant({
      entityTenantOf: (request) =>
        request.surface.entity?.id === "inv_1" ? "acme" : undefined,
    });
    expect(
      await rule.evaluate(
        executeRequest({ user: { ...dean, tenantId: "acme" } }),
      ),
    ).toBeUndefined();
    expect(
      await rule.evaluate(
        executeRequest({ user: { ...dean, tenantId: "other" } }),
      ),
    ).toMatchObject({ effect: "deny", code: "tenant-mismatch" });
  });

  it("limitActionRate denies beyond the window and recovers after it", async () => {
    let nowMs = 0;
    const rule = limitActionRate({
      max: 2,
      perMs: 1000,
      now: () => new Date(nowMs),
    });
    expect(await rule.evaluate(executeRequest())).toBeUndefined();
    expect(await rule.evaluate(executeRequest())).toBeUndefined();
    expect(await rule.evaluate(executeRequest())).toMatchObject({
      effect: "deny",
      code: "rate-limited",
    });
    nowMs = 2000;
    expect(await rule.evaluate(executeRequest())).toBeUndefined();
  });

  it("limitMonetaryValue denies above max and confirms above the threshold", async () => {
    const rule = limitMonetaryValue({
      amountOf: (input) =>
        typeof input === "object" && input !== null && "amount" in input
          ? (input as { amount: number }).amount
          : undefined,
      max: 10_000,
      confirmAbove: 1_000,
    });
    expect(
      await rule.evaluate(executeRequest({ input: { amount: 500 } })),
    ).toBeUndefined();
    expect(
      await rule.evaluate(executeRequest({ input: { amount: 5_000 } })),
    ).toMatchObject({ effect: "confirm" });
    expect(
      await rule.evaluate(executeRequest({ input: { amount: 50_000 } })),
    ).toMatchObject({ effect: "deny", code: "amount-exceeded" });
    // Non-monetary actions abstain:
    expect(await rule.evaluate(executeRequest({ input: {} }))).toBeUndefined();
  });

  it("denyOutsideBusinessHours uses the injected clock", async () => {
    const atHour = (hour: number) => {
      const date = new Date(2026, 6, 22);
      date.setHours(hour, 0, 0, 0);
      return date;
    };
    const night = denyOutsideBusinessHours({ now: () => atHour(3) });
    expect(await night.evaluate(executeRequest())).toMatchObject({
      effect: "deny",
      code: "outside-business-hours",
    });
    const day = denyOutsideBusinessHours({ now: () => atHour(10) });
    expect(await day.evaluate(executeRequest())).toBeUndefined();
  });
});

describe("presets", () => {
  it("developmentPolicy allows but still confirms confidential executions", async () => {
    const policy = developmentPolicy();
    expect(
      await policy.evaluate(executeRequest({ sensitivity: "confidential" })),
    ).toMatchObject({ effect: "confirm" });
    expect(await policy.evaluate(executeRequest())).toMatchObject({
      effect: "allow",
    });
  });

  it("standardUserPolicy requires a user, denies restricted, confirms confidential", async () => {
    const policy = standardUserPolicy();
    expect(await policy.evaluate(executeRequest())).toMatchObject({
      effect: "deny",
      code: "unauthenticated",
    });
    expect(
      await policy.evaluate(
        executeRequest({ user: dean, sensitivity: "restricted" }),
      ),
    ).toMatchObject({ effect: "deny", code: "sensitivity-exceeded" });
    expect(
      await policy.evaluate(
        executeRequest({ user: dean, sensitivity: "confidential" }),
      ),
    ).toMatchObject({ effect: "confirm" });
    expect(await policy.evaluate(executeRequest({ user: dean }))).toMatchObject(
      { effect: "allow" },
    );
  });

  it("standardUserPolicy composes extra rules after the standard ones", async () => {
    const policy = standardUserPolicy({
      rules: [requireRole("finance-admin", { forActions: ["send"] })],
    });
    expect(
      await policy.evaluate(
        executeRequest({ user: { type: "user", id: "u2", roles: [] } }),
      ),
    ).toMatchObject({ effect: "deny", code: "role-missing" });
  });

  it("readOnlyPolicy allows reads and denies every execution and preview", async () => {
    const policy = readOnlyPolicy();
    expect(
      await policy.evaluate({
        operation: "read-resource",
        surface,
        resourceId: "summary",
      }),
    ).toMatchObject({ effect: "allow" });
    expect(await policy.evaluate(executeRequest())).toMatchObject({
      effect: "deny",
      code: "read-only",
    });
    expect(
      await policy.evaluate({
        operation: "preview-action",
        surface,
        actionId: "send",
      }),
    ).toMatchObject({ effect: "deny" });
  });
});
