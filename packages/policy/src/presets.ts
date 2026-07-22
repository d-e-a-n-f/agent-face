import type { JsonValue } from "@agentface/core";
import { createPolicyEngine } from "./engine.js";
import {
  enforceActionConfirmation,
  enforceDelegation,
  enforceSensitivity,
} from "./rules.js";
import type {
  AgentPolicyDecision,
  AgentPolicyRequest,
  AgentPolicyRule,
  ComposedAgentPolicyEngine,
} from "./types.js";

function deny(reason: string, code: string): AgentPolicyDecision {
  return { effect: "deny", reason, code };
}

/**
 * Denies every operation that has no authenticated user principal. The
 * baseline rule for any deployment where anonymous traffic must not reach
 * surfaces.
 */
export function requireUser(): AgentPolicyRule {
  return {
    id: "require-user",
    evaluate(request) {
      return request.user === undefined
        ? deny("No authenticated user", "unauthenticated")
        : undefined;
    },
  };
}

/**
 * When an agent principal is present, requires a delegation naming that
 * agent. Alias of {@link enforceDelegation} under the recipe-friendly name.
 */
export function requireDelegation(): AgentPolicyRule {
  return enforceDelegation();
}

/** Options for {@link requireRole}. */
export interface RequireRoleOptions {
  /**
   * Extracts the current user's roles. Defaults to the `roles` field on
   * the user principal; provide this when roles live elsewhere (session
   * claims, a lookup table).
   */
  readonly rolesOf?: (request: AgentPolicyRequest) => readonly string[];
  /**
   * Restrict the requirement to specific action ids. Omitted: the role is
   * required for every `execute-action`.
   */
  readonly forActions?: readonly string[];
}

/**
 * Denies `execute-action` unless the user holds the given role.
 *
 * @example
 * ```ts
 * requireRole("finance-admin", { forActions: ["send", "apply-discount"] });
 * ```
 */
export function requireRole(
  role: string,
  options: RequireRoleOptions = {},
): AgentPolicyRule {
  const rolesOf =
    options.rolesOf ?? ((request: AgentPolicyRequest) => request.user?.roles ?? []);
  return {
    id: `require-role:${role}`,
    evaluate(request) {
      if (request.operation !== "execute-action") {
        return undefined;
      }
      if (
        options.forActions !== undefined &&
        (request.actionId === undefined ||
          !options.forActions.includes(request.actionId))
      ) {
        return undefined;
      }
      return rolesOf(request).includes(role)
        ? undefined
        : deny(`Requires the "${role}" role`, "role-missing");
    },
  };
}

/**
 * Denies operations whose surface entity belongs to a different tenant
 * than the user. Abstains when either side carries no tenant: entities
 * opt in by including `tenantId` in their reference id-space via
 * `entityTenantOf`.
 */
export function requireSameTenant(options: {
  /** Extracts the tenant owning the target entity, if any. */
  readonly entityTenantOf: (request: AgentPolicyRequest) => string | undefined;
}): AgentPolicyRule {
  return {
    id: "require-same-tenant",
    evaluate(request) {
      const userTenant = request.user?.tenantId;
      const entityTenant = options.entityTenantOf(request);
      if (userTenant === undefined || entityTenant === undefined) {
        return undefined;
      }
      return userTenant === entityTenant
        ? undefined
        : deny("Entity belongs to a different tenant", "tenant-mismatch");
    },
  };
}

/** Options for {@link limitActionRate}. */
export interface LimitActionRateOptions {
  /** Maximum `execute-action` evaluations allowed per window. */
  readonly max: number;
  /** Window length in milliseconds. */
  readonly perMs: number;
  /** Injectable clock for deterministic tests. */
  readonly now?: () => Date;
}

/**
 * Denies `execute-action` beyond a rate. Counted per rule instance
 * (in-memory, browser-local — a UX guard against runaway loops, not a
 * server-side quota).
 */
export function limitActionRate(
  options: LimitActionRateOptions,
): AgentPolicyRule {
  const now = options.now ?? (() => new Date());
  const timestamps: number[] = [];
  return {
    id: "limit-action-rate",
    evaluate(request) {
      if (request.operation !== "execute-action") {
        return undefined;
      }
      const cutoff = now().getTime() - options.perMs;
      while (timestamps.length > 0 && (timestamps[0] ?? 0) < cutoff) {
        timestamps.shift();
      }
      if (timestamps.length >= options.max) {
        return deny(
          `Rate limit: at most ${options.max} executions per ${options.perMs}ms`,
          "rate-limited",
        );
      }
      timestamps.push(now().getTime());
      return undefined;
    },
  };
}

/** Options for {@link limitMonetaryValue}. */
export interface LimitMonetaryValueOptions {
  /**
   * Extracts the monetary amount from a request, or `undefined` when the
   * action has no monetary dimension (the rule then abstains).
   */
  readonly amountOf: (
    input: JsonValue | undefined,
    request: AgentPolicyRequest,
  ) => number | undefined;
  /** Amounts strictly above this are denied. */
  readonly max: number;
  /** Amounts strictly above this require confirmation. */
  readonly confirmAbove?: number;
}

/**
 * Caps the monetary value an agent may move: deny above `max`, confirm
 * above `confirmAbove`. You supply `amountOf` — AgentFace never guesses
 * which input field is money.
 */
export function limitMonetaryValue(
  options: LimitMonetaryValueOptions,
): AgentPolicyRule {
  return {
    id: "limit-monetary-value",
    evaluate(request) {
      if (request.operation !== "execute-action") {
        return undefined;
      }
      const amount = options.amountOf(
        request.input as JsonValue | undefined,
        request,
      );
      if (amount === undefined) {
        return undefined;
      }
      if (amount > options.max) {
        return deny(
          `Amount ${amount} exceeds the agent-operable maximum ${options.max}`,
          "amount-exceeded",
        );
      }
      if (options.confirmAbove !== undefined && amount > options.confirmAbove) {
        return {
          effect: "confirm",
          reason: `Amount ${amount} exceeds ${options.confirmAbove} and needs your approval`,
        };
      }
      return undefined;
    },
  };
}

/** Options for {@link denyOutsideBusinessHours}. */
export interface DenyOutsideBusinessHoursOptions {
  /** Inclusive start hour (0–23) in the evaluated timezone. Default 8. */
  readonly startHour?: number;
  /** Exclusive end hour (0–23). Default 18. */
  readonly endHour?: number;
  /** Injectable clock for deterministic tests. */
  readonly now?: () => Date;
  /** Restrict to specific action ids; omitted applies to all executions. */
  readonly forActions?: readonly string[];
}

/**
 * Denies `execute-action` outside business hours (local time of the
 * evaluating runtime). Inject `now` for deterministic tests and timezone
 * control.
 */
export function denyOutsideBusinessHours(
  options: DenyOutsideBusinessHoursOptions = {},
): AgentPolicyRule {
  const startHour = options.startHour ?? 8;
  const endHour = options.endHour ?? 18;
  const now = options.now ?? (() => new Date());
  return {
    id: "deny-outside-business-hours",
    evaluate(request) {
      if (request.operation !== "execute-action") {
        return undefined;
      }
      if (
        options.forActions !== undefined &&
        (request.actionId === undefined ||
          !options.forActions.includes(request.actionId))
      ) {
        return undefined;
      }
      const hour = now().getHours();
      return hour >= startHour && hour < endHour
        ? undefined
        : deny(
            `Executions are allowed between ${startHour}:00 and ${endHour}:00`,
            "outside-business-hours",
          );
    },
  };
}

/**
 * Development preset: everything allowed, but confidential+ executions
 * still require confirmation — so the confirmation UX is exercised from
 * day one instead of appearing for the first time in production.
 */
export function developmentPolicy(): ComposedAgentPolicyEngine {
  return createPolicyEngine([enforceActionConfirmation()]);
}

/** Options for {@link standardUserPolicy}. */
export interface StandardUserPolicyOptions {
  /** Extra rules evaluated after the standard ones. */
  readonly rules?: readonly AgentPolicyRule[];
}

/**
 * The sensible production baseline for a signed-in human assisted by an
 * agent: an authenticated user is required, agents need a valid
 * delegation, `restricted` capabilities are denied outright, and
 * confidential+ executions require confirmation.
 */
export function standardUserPolicy(
  options: StandardUserPolicyOptions = {},
): ComposedAgentPolicyEngine {
  return createPolicyEngine([
    requireUser(),
    enforceDelegation(),
    enforceSensitivity({ read: "confidential", execute: "confidential" }),
    enforceActionConfirmation(),
    ...(options.rules ?? []),
  ]);
}

/**
 * Read-only preset: discovery, inspection, and resource reads are
 * allowed; every `preview-action`/`execute-action` is denied. For
 * dashboards, audits, and "look but don't touch" agent access.
 */
export function readOnlyPolicy(): ComposedAgentPolicyEngine {
  return createPolicyEngine([
    {
      id: "read-only",
      evaluate(request) {
        return request.operation === "execute-action" ||
          request.operation === "preview-action"
          ? deny("This workspace is read-only for agents", "read-only")
          : undefined;
      },
    },
  ]);
}
