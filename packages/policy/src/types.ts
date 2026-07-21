import type {
  AgentActionId,
  AgentEntityReference,
  AgentFaceId,
  AgentPrincipal,
  AgentResourceId,
  AgentSensitivity,
  AgentSurfaceInstanceId,
  DelegationContext,
  UserPrincipal,
} from "@agentface/core";

/** The operations a policy can gate. */
export const AGENT_POLICY_OPERATIONS = [
  "discover",
  "read-resource",
  "inspect-action",
  "preview-action",
  "execute-action",
] as const;

/** One of the gated operations. */
export type AgentPolicyOperation = (typeof AGENT_POLICY_OPERATIONS)[number];

/** The identities involved in an operation: the human, the agent, and the authority linking them. */
export interface PrincipalContext {
  readonly user?: UserPrincipal;
  readonly agent?: AgentPrincipal;
  readonly delegation?: DelegationContext;
}

/** The surface an operation targets. */
export interface AgentPolicySurfaceContext {
  readonly faceId: AgentFaceId;
  readonly instanceId: AgentSurfaceInstanceId;
  readonly entity?: AgentEntityReference;
}

/**
 * Everything a policy rule may consider when deciding an operation. The
 * request stays serialisable (`input` is the validated action input — typed
 * `unknown` as rules must narrow it before use; it is a trust boundary).
 */
export interface AgentPolicyRequest {
  readonly operation: AgentPolicyOperation;

  readonly user?: UserPrincipal;
  readonly agent?: AgentPrincipal;
  readonly delegation?: DelegationContext;

  readonly surface: AgentPolicySurfaceContext;

  readonly resourceId?: AgentResourceId;
  readonly actionId?: AgentActionId;

  readonly sensitivity?: AgentSensitivity;
  readonly input?: unknown;
}

/**
 * The outcome of policy evaluation. `confirm` means the operation may proceed
 * only after explicit user confirmation of the exact prepared operation.
 */
export type AgentPolicyDecision =
  | { readonly effect: "allow" }
  | { readonly effect: "confirm"; readonly reason: string }
  | {
      readonly effect: "deny";
      readonly reason: string;
      readonly code?: string;
    };

/** Evaluates policy requests. Implementations must be deterministic. */
export interface AgentPolicyEngine {
  evaluate(request: AgentPolicyRequest): Promise<AgentPolicyDecision>;
}

/**
 * A composable policy rule. Returning `undefined` abstains, leaving the
 * decision to later rules or the engine default.
 */
export interface AgentPolicyRule {
  readonly id: string;
  evaluate(
    request: AgentPolicyRequest,
  ):
    | AgentPolicyDecision
    | undefined
    | Promise<AgentPolicyDecision | undefined>;
}

/** How one rule voted during an evaluation. */
export interface AgentPolicyRuleTraceEntry {
  readonly ruleId: string;
  readonly decision: AgentPolicyDecision | "abstain";
}

/** A decision together with the per-rule trace that produced it. */
export interface AgentPolicyEvaluation {
  readonly decision: AgentPolicyDecision;
  readonly trace: readonly AgentPolicyRuleTraceEntry[];
}

/** A policy engine that also exposes its per-rule decision trace. */
export interface ComposedAgentPolicyEngine extends AgentPolicyEngine {
  evaluateWithTrace(request: AgentPolicyRequest): Promise<AgentPolicyEvaluation>;
}
