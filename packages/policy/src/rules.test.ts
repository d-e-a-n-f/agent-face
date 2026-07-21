import type { AgentPrincipal, UserPrincipal } from "@agentface/core";
import { describe, expect, it } from "vitest";
import {
  enforceActionConfirmation,
  enforceDelegation,
  enforceSensitivity,
  requireAuthenticatedAgent,
} from "./rules.js";
import type { AgentPolicyRequest } from "./types.js";

const user: UserPrincipal = { type: "user", id: "user_1" };
const agent: AgentPrincipal = { type: "agent", id: "agent_1" };

const base: AgentPolicyRequest = {
  operation: "execute-action",
  surface: { faceId: "billing.invoice", instanceId: "billing.invoice:inv_1:1" },
  actionId: "send",
};

describe("requireAuthenticatedAgent", () => {
  it("denies when no agent principal is present", () => {
    expect(
      requireAuthenticatedAgent().evaluate(base),
    ).toMatchObject({ effect: "deny", code: "unauthenticated" });
  });

  it("abstains when an agent is present", () => {
    expect(
      requireAuthenticatedAgent().evaluate({ ...base, agent }),
    ).toBeUndefined();
  });
});

describe("enforceSensitivity", () => {
  const rule = enforceSensitivity({ read: "internal", execute: "internal" });

  it("abstains without a sensitivity classification", () => {
    expect(rule.evaluate(base)).toBeUndefined();
  });

  it("allows reads at or below the ceiling", () => {
    expect(
      rule.evaluate({
        ...base,
        operation: "read-resource",
        sensitivity: "internal",
      }),
    ).toBeUndefined();
  });

  it("denies reads above the ceiling", () => {
    expect(
      rule.evaluate({
        ...base,
        operation: "read-resource",
        sensitivity: "confidential",
      }),
    ).toMatchObject({ effect: "deny", code: "sensitivity-exceeded" });
  });

  it.each(["preview-action", "execute-action"] as const)(
    "denies %s above the execute ceiling",
    async (operation) => {
      expect(
        rule.evaluate({ ...base, operation, sensitivity: "restricted" }),
      ).toMatchObject({
        effect: "deny",
        code: "sensitivity-exceeded",
      });
    },
  );
});

describe("enforceDelegation", () => {
  const now = () => new Date("2026-07-21T12:00:00.000Z");
  const rule = enforceDelegation({ now });
  const delegation = {
    userId: "user_1",
    agentId: "agent_1",
    grantedAt: "2026-07-21T00:00:00.000Z",
  };

  it("abstains when no agent is acting", () => {
    expect(rule.evaluate({ ...base, user })).toBeUndefined();
  });

  it("denies an agent without a delegation", () => {
    expect(rule.evaluate({ ...base, agent })).toMatchObject({
      effect: "deny",
      code: "delegation-missing",
    });
  });

  it("denies a delegation granted to a different agent", () => {
    expect(
      rule.evaluate({
        ...base,
        agent: { type: "agent", id: "someone-else" },
        delegation,
      }),
    ).toMatchObject({ effect: "deny", code: "delegation-mismatch" });
  });

  it("denies a delegation granted by a different user", () => {
    expect(
      rule.evaluate({
        ...base,
        agent,
        user: { type: "user", id: "other-user" },
        delegation,
      }),
    ).toMatchObject({ effect: "deny", code: "delegation-mismatch" });
  });

  it("denies an expired delegation deterministically", () => {
    expect(
      rule.evaluate({
        ...base,
        agent,
        user,
        delegation: { ...delegation, expiresAt: "2026-07-21T11:59:59.000Z" },
      }),
    ).toMatchObject({ effect: "deny", code: "delegation-expired" });
  });

  it("abstains for a valid, unexpired delegation", () => {
    expect(
      rule.evaluate({
        ...base,
        agent,
        user,
        delegation: { ...delegation, expiresAt: "2026-07-21T12:00:01.000Z" },
      }),
    ).toBeUndefined();
  });
});

describe("enforceActionConfirmation", () => {
  it("escalates executions at or above the threshold", () => {
    expect(
      enforceActionConfirmation().evaluate({
        ...base,
        sensitivity: "confidential",
      }),
    ).toMatchObject({ effect: "confirm" });
  });

  it("abstains below the threshold and for non-executions", () => {
    const rule = enforceActionConfirmation();
    expect(
      rule.evaluate({ ...base, sensitivity: "internal" }),
    ).toBeUndefined();
    expect(
      rule.evaluate({
        ...base,
        operation: "read-resource",
        sensitivity: "restricted",
      }),
    ).toBeUndefined();
  });

  it("honours a custom threshold", () => {
    expect(
      enforceActionConfirmation({ atOrAbove: "internal" }).evaluate({
        ...base,
        sensitivity: "internal",
      }),
    ).toMatchObject({ effect: "confirm" });
  });
});
