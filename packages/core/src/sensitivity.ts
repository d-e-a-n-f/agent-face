/**
 * Sensitivity levels, ordered from least to most sensitive. Policies use the
 * ordering to allow, escalate, or deny reads and executions.
 */
export const AGENT_SENSITIVITY_LEVELS = [
  "public",
  "internal",
  "confidential",
  "restricted",
] as const;

/** Sensitivity classification for a resource or action. */
export type AgentSensitivity = (typeof AGENT_SENSITIVITY_LEVELS)[number];

/**
 * Compares two sensitivity levels.
 *
 * @returns a negative number if `a` is less sensitive than `b`, zero if equal,
 * a positive number if more sensitive.
 *
 * @example
 * ```ts
 * compareSensitivity("confidential", "internal") > 0; // true
 * ```
 */
export function compareSensitivity(
  a: AgentSensitivity,
  b: AgentSensitivity,
): number {
  return (
    AGENT_SENSITIVITY_LEVELS.indexOf(a) - AGENT_SENSITIVITY_LEVELS.indexOf(b)
  );
}
