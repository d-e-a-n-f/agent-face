import type { JsonObject, JsonValue } from "@agentface/core";

/**
 * Provider-neutral model contracts. Every shape here is JSON-serialisable so
 * an adapter can live across an HTTP boundary (e.g. a browser assistant loop
 * calling a server-side Bedrock adapter).
 */

/** A piece of assistant/user conversation content. Discriminated by `type`. */
export type AssistantContentPart =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "tool-call";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly input: JsonValue;
    }
  | {
      readonly type: "tool-result";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly result: JsonValue;
      readonly isError?: boolean;
    };

/** One turn in the assistant conversation. */
export interface AssistantMessage {
  readonly role: "user" | "assistant";
  readonly content: readonly AssistantContentPart[];
}

/** A tool exposed to the model, with a JSON Schema input contract. */
export interface AgentModelToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
}

/** One completion request to a model provider. */
export interface AgentModelRequest {
  readonly system: string;
  readonly messages: readonly AssistantMessage[];
  readonly tools: readonly AgentModelToolDefinition[];
}

/** A tool invocation requested by the model. */
export interface AgentModelToolCall {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: JsonValue;
}

/** Why the model stopped. */
export type AgentModelStopReason =
  | "end-turn"
  | "tool-use"
  | "refusal"
  | "other";

/** One completion from a model provider. */
export interface AgentModelResponse {
  readonly text?: string;
  readonly toolCalls: readonly AgentModelToolCall[];
  readonly stopReason: AgentModelStopReason;
}

/**
 * Translates between the assistant loop and one model provider. Adapters are
 * stateless request/response translators — the assistant loop owns the
 * conversation, and the runtime owns all execution.
 */
export interface AgentModelAdapter {
  complete(request: AgentModelRequest): Promise<AgentModelResponse>;
}
