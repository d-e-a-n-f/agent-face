import type { AgentActionDefinition, AgentActionPreview } from "./actions.js";
import { AgentFaceError } from "./errors.js";
import type { AgentFaceDefinition } from "./faces.js";
import type { AgentEventId } from "./ids.js";
import type { JsonValue } from "./json.js";
import type { AgentResourceDefinition } from "./resources.js";
import type { AgentInputSchema } from "./schema.js";

/**
 * Describes an event a surface can emit for agents to observe. Minimal in the
 * first implementation: metadata plus an optional payload schema.
 */
export interface AgentEventDefinition<TPayload = JsonValue> {
  readonly id: AgentEventId;
  readonly name: string;
  readonly description: string;
  readonly payload?: AgentInputSchema<TPayload>;
}

/**
 * Derives a human-readable name from an identifier: the last dot segment,
 * dashes/underscores as spaces, first letter capitalised.
 * `"save-draft"` → `"Save draft"`, `"billing.invoice"` → `"Invoice"`.
 */
export function humanizeId(id: string): string {
  const segment = id.split(".").at(-1) ?? id;
  const words = segment.replace(/[-_]+/g, " ").trim();
  return words.length === 0
    ? id
    : words.charAt(0).toUpperCase() + words.slice(1);
}

/** `billing.invoice`, `counter.current-value`, `send` — dot/dash-separated segments. */
const ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i;
/** Semver-style: `0.1.0`, `1.2.3-beta.1`. */
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/i;
/**
 * Hard cap on identifier length. Ids feed model tool names (which providers
 * cap at 64 characters) and trace output; a bound keeps derived names
 * collision-resolvable.
 */
export const MAX_ID_LENGTH = 48;

function invalid(message: string): never {
  throw new AgentFaceError({ code: "INVALID_INPUT", message });
}

function assertId(id: string, what: string): void {
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    invalid(
      `${what} id ${JSON.stringify(id)} is invalid: expected dot/dash-separated segments like "billing.invoice"`,
    );
  }
  if (id.length > MAX_ID_LENGTH) {
    invalid(
      `${what} id ${JSON.stringify(id)} is too long: maximum ${MAX_ID_LENGTH} characters`,
    );
  }
}

function assertText(value: string, what: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    invalid(`${what} ${field} must be a non-empty string`);
  }
}

/**
 * Validates and freezes a face definition.
 *
 * @throws `AgentFaceError` with code `INVALID_INPUT` when the id, name,
 * description, version, or relationships are malformed.
 *
 * @example
 * ```ts
 * const invoiceFace = defineAgentFace({
 *   id: "billing.invoice",
 *   name: "Invoice",
 *   description: "View, edit and send a customer invoice",
 *   version: "0.1.0",
 * });
 * ```
 */
export function defineAgentFace(
  definition: AgentFaceDefinition,
): AgentFaceDefinition {
  assertId(definition.id, "Face");
  if (definition.name !== undefined) {
    assertText(definition.name, "Face", "name");
  }
  assertText(definition.description, "Face", "description");
  if (definition.version !== undefined && !VERSION_PATTERN.test(definition.version)) {
    invalid(
      `Face version ${JSON.stringify(definition.version)} is invalid: expected a semver string like "0.1.0"`,
    );
  }
  for (const relationship of definition.relationships ?? []) {
    assertId(relationship.targetFaceId, "Face relationship target");
  }
  return Object.freeze({
    ...definition,
    name: definition.name ?? humanizeId(definition.id),
    version: definition.version ?? "0.0.0",
  });
}

/**
 * Validates and freezes a resource definition. Generic over the live value
 * type so `serialize` stays fully typed.
 *
 * @throws `AgentFaceError` with code `INVALID_INPUT` on malformed metadata.
 *
 * @example
 * ```ts
 * const summary = defineAgentResource<InvoiceSummary>({
 *   id: "summary",
 *   name: "Invoice summary",
 *   description: "The current invoice totals and status",
 * });
 * ```
 */
export function defineAgentResource<TValue = JsonValue>(
  definition: AgentResourceDefinition<TValue>,
): AgentResourceDefinition<TValue> {
  assertId(definition.id, "Resource");
  if (definition.name !== undefined) {
    assertText(definition.name, "Resource", "name");
  }
  assertText(definition.description, "Resource", "description");
  return Object.freeze({
    ...definition,
    name: definition.name ?? humanizeId(definition.id),
  });
}

/**
 * Validates and freezes an action definition, preserving the input, result,
 * and preview generics for the runtime and callers.
 *
 * @throws `AgentFaceError` with code `INVALID_INPUT` on malformed metadata or
 * a missing `input` schema / `execute` function.
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
export function defineAgentAction<
  TInput,
  TResult extends JsonValue,
  TPreview extends AgentActionPreview = AgentActionPreview,
>(
  definition: AgentActionDefinition<TInput, TResult, TPreview>,
): AgentActionDefinition<TInput, TResult, TPreview> {
  assertId(definition.id, "Action");
  if (definition.name !== undefined) {
    assertText(definition.name, "Action", "name");
  }
  assertText(definition.description, "Action", "description");
  if (definition.input !== undefined && typeof definition.input.parse !== "function") {
    invalid(`Action "${definition.id}" requires an input schema with parse()`);
  }
  if (typeof definition.execute !== "function") {
    invalid(`Action "${definition.id}" requires an execute function`);
  }
  for (const precondition of definition.preconditions ?? []) {
    assertText(precondition.id, "Precondition", "id");
    assertText(precondition.description, "Precondition", "description");
    if (typeof precondition.check !== "function") {
      invalid(
        `Precondition "${precondition.id}" on action "${definition.id}" requires a check function`,
      );
    }
  }
  return Object.freeze({
    ...definition,
    name: definition.name ?? humanizeId(definition.id),
  });
}

/**
 * Validates and freezes an event definition.
 *
 * @throws `AgentFaceError` with code `INVALID_INPUT` on malformed metadata.
 */
export function defineAgentEvent<TPayload = JsonValue>(
  definition: AgentEventDefinition<TPayload>,
): AgentEventDefinition<TPayload> {
  assertId(definition.id, "Event");
  assertText(definition.name, "Event", "name");
  assertText(definition.description, "Event", "description");
  return Object.freeze({ ...definition });
}
