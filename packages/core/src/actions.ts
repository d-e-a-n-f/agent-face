import type { AgentError } from "./errors.js";
import type { AgentActionId } from "./ids.js";
import type { JsonValue } from "./json.js";
import type { AgentInputSchema } from "./schema.js";
import type { AgentSensitivity } from "./sensitivity.js";

/**
 * A business rule that must hold before an action can be prepared or
 * executed, e.g. "the invoice must still be a draft". Failing preconditions
 * produce `PRECONDITION_FAILED` errors that identify the failing rule.
 */
export interface AgentPrecondition {
  readonly id: string;
  readonly description: string;
  /** Evaluated against current application state at preparation time. */
  readonly check: () => boolean | Promise<boolean>;
}

/**
 * When an action requires explicit user confirmation. Confirmation always
 * binds to the exact prepared operation (surface instance, action, validated
 * input, preview, revision, expiry) — never a blanket grant.
 */
export type AgentConfirmationRule<TInput = unknown> =
  | "never"
  | "always"
  | {
      readonly type: "conditional";
      readonly evaluate: (input: TInput) => boolean;
      readonly reason?: string;
    };

/**
 * Marks an action as a recommended next step while `when` holds against
 * current application state. UIs surface recommendations as one-tap next
 * steps; they re-evaluate as state changes. The closures stay local and are
 * never serialised — only the evaluated snapshot travels.
 */
export interface AgentActionRecommendation {
  /** Whether this action is the sensible next step right now. */
  readonly when: () => boolean;
  /** Why it is recommended, shown to the user. */
  readonly reason?: string;
  /**
   * The natural-language instruction a UI sends to the assistant to run it
   * (so recommendations flow through the full policy/confirmation path).
   * Defaults to the action name. A function form supports dynamic values.
   */
  readonly instruction?: string | (() => string);
  /** Ordering among concurrent recommendations; higher first. Default 0. */
  readonly priority?: number;
}

/** One intended state change shown to the user before execution. */
export interface AgentActionChange {
  /** Path of the affected state, e.g. `"status"`. */
  readonly path: string;
  readonly from: JsonValue;
  readonly to: JsonValue;
}

/**
 * What an action will do, generated at preparation time and shown to the user
 * when confirming.
 *
 * @example
 * ```ts
 * const preview: AgentActionPreview = {
 *   summary: "Send INV-9821 to billing@acme.co",
 *   changes: [{ path: "status", from: "draft", to: "sent" }],
 * };
 * ```
 */
export interface AgentActionPreview {
  readonly summary: string;
  readonly changes?: readonly AgentActionChange[];
}

/**
 * The structured outcome of an executed action.
 *
 * @typeParam TResult - the success payload type.
 */
export type AgentActionResult<TResult = JsonValue> =
  | { readonly status: "succeeded"; readonly result: TResult }
  | { readonly status: "failed"; readonly error: AgentError };

/**
 * Describes an operation an agent may invoke, expressed as business intent
 * (`invoice.send`), never UI mechanics (`clickButton`). The `execute` and
 * `preview` closures stay local to the application — they are never
 * serialised; only the metadata travels.
 *
 * @typeParam TInput - the validated input type, carried by `input`.
 * @typeParam TResult - what `execute` resolves to.
 * @typeParam TPreview - the preview shape, when `preview` is provided.
 *
 * @example
 * ```ts
 * const send = defineAgentAction({
 *   id: "send",
 *   name: "Send invoice",
 *   description: "Send the completed invoice to the customer",
 *   input: fromZod(z.object({ message: z.string().optional() })),
 *   confirmation: "always",
 *   execute: async (input) => sendInvoice(invoice.id, input),
 * });
 * ```
 */
export interface AgentActionDefinition<
  TInput,
  TResult,
  TPreview extends AgentActionPreview = AgentActionPreview,
> {
  readonly id: AgentActionId;
  readonly name: string;
  readonly description: string;
  readonly input: AgentInputSchema<TInput>;
  readonly sensitivity?: AgentSensitivity;
  readonly confirmation?: AgentConfirmationRule<TInput>;
  readonly preconditions?: readonly AgentPrecondition[];
  readonly tags?: readonly string[];
  /** Marks this action as a suggested next step while its condition holds. */
  readonly recommend?: AgentActionRecommendation;
  readonly preview?: (input: TInput) => TPreview | Promise<TPreview>;
  readonly execute: (input: TInput) => TResult | Promise<TResult>;
}
