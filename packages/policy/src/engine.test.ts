import { describe, expect, it } from "vitest";
import { createPolicyEngine } from "./engine.js";
import { allowAll, denyAll } from "./rules.js";
import type { AgentPolicyRequest, AgentPolicyRule } from "./types.js";

const request: AgentPolicyRequest = {
  operation: "execute-action",
  surface: { faceId: "billing.invoice", instanceId: "billing.invoice:inv_1:1" },
  actionId: "send",
};

function rule(
  id: string,
  decision: ReturnType<AgentPolicyRule["evaluate"]>,
): AgentPolicyRule {
  return { id, evaluate: () => decision };
}

describe("createPolicyEngine", () => {
  it("allows by default with no rules", async () => {
    const engine = createPolicyEngine([]);
    await expect(engine.evaluate(request)).resolves.toEqual({
      effect: "allow",
    });
  });

  it("denies by default when configured, with a reason and code", async () => {
    const engine = createPolicyEngine([], { defaultEffect: "deny" });
    await expect(engine.evaluate(request)).resolves.toEqual({
      effect: "deny",
      reason: "No policy rule allowed this operation",
      code: "default-deny",
    });
  });

  it("an explicit allow overrides default-deny", async () => {
    const engine = createPolicyEngine([allowAll()], { defaultEffect: "deny" });
    await expect(engine.evaluate(request)).resolves.toEqual({
      effect: "allow",
    });
  });

  it("first deny wins and stops evaluation", async () => {
    const evaluated: string[] = [];
    const tracker: AgentPolicyRule = {
      id: "tracker",
      evaluate() {
        evaluated.push("tracker");
        return undefined;
      },
    };
    const engine = createPolicyEngine([denyAll("stop"), tracker]);
    const decision = await engine.evaluate(request);
    expect(decision).toMatchObject({ effect: "deny", reason: "stop" });
    expect(evaluated).toEqual([]);
  });

  it("confirm escalates an allow, keeping the first confirm reason", async () => {
    const engine = createPolicyEngine([
      allowAll(),
      rule("confirm-1", { effect: "confirm", reason: "first" }),
      rule("confirm-2", { effect: "confirm", reason: "second" }),
    ]);
    await expect(engine.evaluate(request)).resolves.toEqual({
      effect: "confirm",
      reason: "first",
    });
  });

  it("deny beats confirm regardless of order", async () => {
    const engine = createPolicyEngine([
      rule("confirm", { effect: "confirm", reason: "check" }),
      denyAll("no"),
    ]);
    await expect(engine.evaluate(request)).resolves.toMatchObject({
      effect: "deny",
      reason: "no",
    });
  });

  it("abstaining rules leave the decision to later rules", async () => {
    const engine = createPolicyEngine([
      rule("abstain", undefined),
      denyAll("later rule decided"),
    ]);
    await expect(engine.evaluate(request)).resolves.toMatchObject({
      effect: "deny",
      reason: "later rule decided",
    });
  });

  it("supports async rules", async () => {
    const engine = createPolicyEngine([
      { id: "async", evaluate: () => Promise.resolve({ effect: "allow" }) },
    ]);
    await expect(engine.evaluate(request)).resolves.toEqual({
      effect: "allow",
    });
  });

  it("is deterministic for the same request", async () => {
    const engine = createPolicyEngine([
      rule("confirm", { effect: "confirm", reason: "check" }),
      allowAll(),
    ]);
    const first = await engine.evaluate(request);
    const second = await engine.evaluate(request);
    expect(second).toEqual(first);
  });

  it("records a per-rule trace including abstentions", async () => {
    const engine = createPolicyEngine([
      rule("abstain", undefined),
      allowAll(),
      rule("confirm", { effect: "confirm", reason: "check" }),
    ]);
    const { decision, trace } = await engine.evaluateWithTrace(request);
    expect(decision).toEqual({ effect: "confirm", reason: "check" });
    expect(trace).toEqual([
      { ruleId: "abstain", decision: "abstain" },
      { ruleId: "allow-all", decision: { effect: "allow" } },
      {
        ruleId: "confirm",
        decision: { effect: "confirm", reason: "check" },
      },
    ]);
  });
});
