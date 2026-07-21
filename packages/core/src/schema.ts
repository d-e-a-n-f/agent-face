import type { JsonObject } from "./json.js";

/**
 * The validation abstraction for action inputs. Core contracts depend on this
 * interface rather than any specific schema library, keeping future support
 * open for Standard Schema, Valibot, TypeBox, or raw JSON Schema. A Zod
 * adapter is provided via `@agentface/core/zod`.
 *
 * `parse` receives `unknown` deliberately — input crossing an agent boundary
 * is untrusted until validated; this is the one place `unknown` is the
 * type-safe choice.
 */
export interface AgentInputSchema<TInput> {
  /**
   * Validates untrusted input.
   *
   * @returns the typed input on success.
   * @throws an `AgentFaceError` with code `INVALID_INPUT` on failure.
   */
  parse(input: unknown): TInput;

  /**
   * The JSON Schema representation of the input, used to generate model tool
   * definitions. Optional in the first implementation.
   */
  toJSONSchema?(): JsonObject;
}

/**
 * Extracts the input type carried by an {@link AgentInputSchema}.
 *
 * @example
 * ```ts
 * type SendInput = InferAgentInput<typeof sendAction.input>;
 * ```
 */
export type InferAgentInput<TSchema> =
  TSchema extends AgentInputSchema<infer TInput> ? TInput : never;
