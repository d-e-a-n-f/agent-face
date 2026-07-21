import type {
  AgentPolicyDecision,
  AgentPolicyEvaluation,
  AgentPolicyRequest,
  AgentPolicyRule,
  AgentPolicyRuleTraceEntry,
  ComposedAgentPolicyEngine,
} from "./types.js";

/** Options for {@link createPolicyEngine}. */
export interface CreatePolicyEngineOptions {
  /**
   * The effect when no rule decides. `"allow"` (the default) suits local
   * development; production applications should prefer `"deny"` and grant
   * explicitly.
   */
  readonly defaultEffect?: "allow" | "deny";
}

/**
 * Composes rules into a deterministic policy engine.
 *
 * Evaluation semantics, in order:
 * - Rules are evaluated first to last; `undefined` abstains.
 * - The first `deny` wins immediately (remaining rules are not consulted).
 * - Any `confirm` escalates an otherwise allowed operation (the first
 *   `confirm` reason is kept).
 * - Otherwise: `allow` if any rule allowed, else the configured default.
 *
 * @example
 * ```ts
 * const policy = createPolicyEngine([
 *   requireAuthenticatedAgent(),
 *   enforceSensitivity({ read: "confidential", execute: "internal" }),
 *   enforceActionConfirmation(),
 * ]);
 * const decision = await policy.evaluate(request);
 * ```
 */
export function createPolicyEngine(
  rules: readonly AgentPolicyRule[],
  options: CreatePolicyEngineOptions = {},
): ComposedAgentPolicyEngine {
  const defaultEffect = options.defaultEffect ?? "allow";

  async function evaluateWithTrace(
    request: AgentPolicyRequest,
  ): Promise<AgentPolicyEvaluation> {
    const trace: AgentPolicyRuleTraceEntry[] = [];
    let confirm: Extract<AgentPolicyDecision, { effect: "confirm" }> | undefined;
    let allowed = false;

    for (const rule of rules) {
      const decision = (await rule.evaluate(request)) ?? "abstain";
      trace.push({ ruleId: rule.id, decision });
      if (decision === "abstain") {
        continue;
      }
      switch (decision.effect) {
        case "deny":
          return { decision, trace };
        case "confirm":
          confirm ??= decision;
          break;
        case "allow":
          allowed = true;
          break;
        default: {
          const exhaustive: never = decision;
          return exhaustive;
        }
      }
    }

    if (confirm !== undefined) {
      return { decision: confirm, trace };
    }
    if (allowed || defaultEffect === "allow") {
      return { decision: { effect: "allow" }, trace };
    }
    return {
      decision: {
        effect: "deny",
        reason: "No policy rule allowed this operation",
        code: "default-deny",
      },
      trace,
    };
  }

  return {
    evaluateWithTrace,
    async evaluate(request) {
      const { decision } = await evaluateWithTrace(request);
      return decision;
    },
  };
}
