/**
 * AgentFace policy engine. Decides whether an operation is allowed, denied,
 * or allowed with confirmation. Policies never execute actions — the runtime
 * consults them and enforces the outcome.
 *
 * @packageDocumentation
 */

export { createPolicyEngine } from "./engine.js";
export type { CreatePolicyEngineOptions } from "./engine.js";

export {
  allowAll,
  denyAll,
  enforceActionConfirmation,
  enforceDelegation,
  enforceSensitivity,
  requireAuthenticatedAgent,
} from "./rules.js";
export type {
  EnforceActionConfirmationOptions,
  EnforceDelegationOptions,
  SensitivityLimits,
} from "./rules.js";

export { AGENT_POLICY_OPERATIONS } from "./types.js";
export type {
  AgentPolicyDecision,
  AgentPolicyEngine,
  AgentPolicyEvaluation,
  AgentPolicyOperation,
  AgentPolicyRequest,
  AgentPolicyRule,
  AgentPolicyRuleTraceEntry,
  AgentPolicySurfaceContext,
  ComposedAgentPolicyEngine,
  PrincipalContext,
} from "./types.js";
