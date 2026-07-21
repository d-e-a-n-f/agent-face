import type { AgentSensitivity } from "@agentface/core";
import { compareSensitivity } from "@agentface/core";
import type { AgentPolicyDecision, AgentPolicyRule } from "./types.js";

function deny(reason: string, code: string): AgentPolicyDecision {
  return { effect: "deny", reason, code };
}

/**
 * Denies every operation not performed by an authenticated agent principal.
 * Compose only into engines that gate agent traffic — human-driven clients
 * (like DevTools operated by the user) evaluate without an agent principal.
 */
export function requireAuthenticatedAgent(): AgentPolicyRule {
  return {
    id: "require-authenticated-agent",
    evaluate(request) {
      return request.agent === undefined
        ? deny("No authenticated agent principal", "unauthenticated")
        : undefined;
    },
  };
}

/** Sensitivity ceilings for {@link enforceSensitivity}. */
export interface SensitivityLimits {
  /** Maximum sensitivity readable via `read-resource`. */
  readonly read?: AgentSensitivity;
  /** Maximum sensitivity operable via `preview-action` / `execute-action`. */
  readonly execute?: AgentSensitivity;
}

/**
 * Denies reads and executions above the configured sensitivity ceilings.
 * Abstains when the request carries no sensitivity classification.
 */
export function enforceSensitivity(limits: SensitivityLimits): AgentPolicyRule {
  return {
    id: "enforce-sensitivity",
    evaluate(request) {
      const { sensitivity, operation } = request;
      if (sensitivity === undefined) {
        return undefined;
      }
      if (
        operation === "read-resource" &&
        limits.read !== undefined &&
        compareSensitivity(sensitivity, limits.read) > 0
      ) {
        return deny(
          `Resource sensitivity "${sensitivity}" exceeds the readable maximum "${limits.read}"`,
          "sensitivity-exceeded",
        );
      }
      if (
        (operation === "preview-action" || operation === "execute-action") &&
        limits.execute !== undefined &&
        compareSensitivity(sensitivity, limits.execute) > 0
      ) {
        return deny(
          `Action sensitivity "${sensitivity}" exceeds the executable maximum "${limits.execute}"`,
          "sensitivity-exceeded",
        );
      }
      return undefined;
    },
  };
}

/** Options for {@link enforceDelegation}. */
export interface EnforceDelegationOptions {
  /** Injectable clock for deterministic expiry checks. */
  readonly now?: () => Date;
}

/**
 * When an agent is acting, requires a delegation that names that agent (and
 * the current user, when present) and has not expired. Abstains for
 * operations without an agent principal.
 */
export function enforceDelegation(
  options: EnforceDelegationOptions = {},
): AgentPolicyRule {
  const now = options.now ?? (() => new Date());
  return {
    id: "enforce-delegation",
    evaluate(request) {
      const { agent, user, delegation } = request;
      if (agent === undefined) {
        return undefined;
      }
      if (delegation === undefined) {
        return deny(
          "Agent is acting without a delegation from the user",
          "delegation-missing",
        );
      }
      if (delegation.agentId !== agent.id) {
        return deny(
          `Delegation was granted to agent "${delegation.agentId}", not "${agent.id}"`,
          "delegation-mismatch",
        );
      }
      if (user !== undefined && delegation.userId !== user.id) {
        return deny(
          `Delegation was granted by user "${delegation.userId}", not "${user.id}"`,
          "delegation-mismatch",
        );
      }
      if (
        delegation.expiresAt !== undefined &&
        now().getTime() > Date.parse(delegation.expiresAt)
      ) {
        return deny("Delegation has expired", "delegation-expired");
      }
      return undefined;
    },
  };
}

/** Options for {@link enforceActionConfirmation}. */
export interface EnforceActionConfirmationOptions {
  /** Sensitivity at or above which executions require confirmation. Defaults to `"confidential"`. */
  readonly atOrAbove?: AgentSensitivity;
}

/**
 * Escalates `execute-action` to `confirm` at or above a sensitivity
 * threshold. This composes with (it does not replace) per-action confirmation
 * rules, which the runtime evaluates from the action definition.
 */
export function enforceActionConfirmation(
  options: EnforceActionConfirmationOptions = {},
): AgentPolicyRule {
  const threshold = options.atOrAbove ?? "confidential";
  return {
    id: "enforce-action-confirmation",
    evaluate(request) {
      if (
        request.operation === "execute-action" &&
        request.sensitivity !== undefined &&
        compareSensitivity(request.sensitivity, threshold) >= 0
      ) {
        return {
          effect: "confirm",
          reason: `Action sensitivity "${request.sensitivity}" requires confirmation`,
        };
      }
      return undefined;
    },
  };
}

/** Allows every operation. For tests and permissive development setups. */
export function allowAll(): AgentPolicyRule {
  return {
    id: "allow-all",
    evaluate() {
      return { effect: "allow" };
    },
  };
}

/** Denies every operation. For tests and lockdown defaults. */
export function denyAll(reason = "Denied by policy"): AgentPolicyRule {
  return {
    id: "deny-all",
    evaluate() {
      return deny(reason, "deny-all");
    },
  };
}
