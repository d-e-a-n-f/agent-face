import type { AgentResourceId } from "./ids.js";
import type { JsonValue } from "./json.js";
import type { AgentSensitivity } from "./sensitivity.js";

/**
 * Describes a piece of feature state an agent may read, e.g. the current
 * invoice totals. The definition is metadata only — live values come from
 * getters registered with the runtime, so reads always reflect current state.
 *
 * @typeParam TValue - the live value's type. Defaults to {@link JsonValue};
 * when the live value is not directly JSON-safe, provide `serialize`.
 *
 * @example
 * ```ts
 * const summary = defineAgentResource({
 *   id: "summary",
 *   name: "Invoice summary",
 *   description: "The current invoice totals and status",
 * });
 * ```
 */
export interface AgentResourceDefinition<TValue = JsonValue> {
  readonly id: AgentResourceId;
  /** Defaults to a humanised form of the id. */
  readonly name?: string;
  readonly description: string;
  readonly sensitivity?: AgentSensitivity;
  readonly tags?: readonly string[];
  /** Converts the live value into its JSON-safe agent-visible form. */
  readonly serialize?: (value: TValue) => JsonValue;
}
