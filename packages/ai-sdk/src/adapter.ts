import type { JsonValue } from "@agentface/core";
import type {
  AgentModelAdapter,
  AgentModelRequest,
  AgentModelResponse,
  AgentModelStopReason,
  AssistantMessage,
} from "@agentface/assistant";
import type {
  AssistantContent,
  JSONValue,
  LanguageModel,
  LanguageModelUsage,
  ModelMessage,
  ToolContent,
  ToolSet,
} from "ai";
import { dynamicTool, generateText, jsonSchema, streamText } from "ai";

/** Options for {@link createAISDKAdapter}. */
export interface CreateAISDKAdapterOptions {
  /**
   * Any Vercel AI SDK language model, e.g. `anthropic("claude-opus-4-8")`,
   * `openai("gpt-5.2")`, or a provider-registry reference. This is how
   * AgentFace supports every provider the AI SDK supports without owning
   * each provider's request format.
   */
  readonly model: LanguageModel;
  /** Maximum output tokens per completion. */
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  /** Extra HTTP headers passed to the provider. */
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Converts the assistant conversation into AI SDK model messages. Our loop
 * appends tool results inside `user`-role messages; the AI SDK separates
 * tool results into `tool`-role messages, so mixed messages are split with
 * ordering preserved (tool results first — they answer the preceding
 * assistant tool calls).
 */
function toModelMessages(
  messages: readonly AssistantMessage[],
): ModelMessage[] {
  const result: ModelMessage[] = [];
  for (const message of messages) {
    if (message.role === "assistant") {
      const content: Exclude<AssistantContent, string> = [];
      for (const part of message.content) {
        if (part.type === "text") {
          content.push({ type: "text", text: part.text });
        } else if (part.type === "tool-call") {
          content.push({
            type: "tool-call",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
          });
        }
      }
      if (content.length > 0) {
        result.push({ role: "assistant", content });
      }
      continue;
    }
    const toolResults: ToolContent = [];
    const texts: { type: "text"; text: string }[] = [];
    for (const part of message.content) {
      if (part.type === "tool-result") {
        // Our JsonValue tolerates undefined-valued properties (dropped at
        // serialisation); the AI SDK's JSONValue does not model that, so
        // the cast is a representation change, not a trust change.
        const value = part.result as JSONValue;
        toolResults.push({
          type: "tool-result",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output:
            part.isError === true
              ? { type: "error-json", value }
              : { type: "json", value },
        });
      } else if (part.type === "text") {
        texts.push({ type: "text", text: part.text });
      }
    }
    if (toolResults.length > 0) {
      result.push({ role: "tool", content: toolResults });
    }
    if (texts.length > 0) {
      result.push({ role: "user", content: texts });
    }
  }
  return result;
}

/**
 * The assistant's tools become AI SDK tools **without execute functions**:
 * the model can request them, but the AI SDK never runs anything — tool
 * calls return to the AgentFace assistant loop, which owns execution
 * through the policy-mediated runtime.
 */
function toToolSet(tools: AgentModelRequest["tools"]): ToolSet {
  return Object.fromEntries(
    tools.map((definition) => [
      definition.name,
      dynamicTool({
        description: definition.description,
        inputSchema: jsonSchema(definition.inputSchema),
      }),
    ]),
  );
}

function toUsage(usage: LanguageModelUsage): {
  inputTokens: number;
  outputTokens: number;
} {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  };
}

function toStopReason(
  finishReason: string,
  toolCallCount: number,
): AgentModelStopReason {
  if (toolCallCount > 0 || finishReason === "tool-calls") {
    return "tool-use";
  }
  switch (finishReason) {
    case "stop":
    case "length":
      return "end-turn";
    case "content-filter":
      return "refusal";
    default:
      return "other";
  }
}

/**
 * Creates an {@link AgentModelAdapter} backed by any Vercel AI SDK language
 * model — one integration for every provider the AI SDK supports.
 *
 * Each `complete()` performs exactly one model round-trip: tools are
 * declared without execute functions, so the AI SDK never runs a tool —
 * the AgentFace assistant loop owns execution, policy, and confirmation.
 *
 * Server-side only (provider credentials must never reach the browser):
 * use it inside `createModelEndpoint` / `createAgentFaceRouteHandler`.
 *
 * @example
 * ```ts
 * // app/api/agentface/route.ts
 * import { createAgentFaceRouteHandler } from "@agentface/next";
 * import { createAISDKAdapter } from "@agentface/ai-sdk";
 * import { anthropic } from "@ai-sdk/anthropic";
 *
 * export const { POST } = createAgentFaceRouteHandler({
 *   adapter: createAISDKAdapter({ model: anthropic("claude-opus-4-8") }),
 * });
 * ```
 */
export function createAISDKAdapter(
  options: CreateAISDKAdapterOptions,
): AgentModelAdapter {
  function callSettings(request: AgentModelRequest) {
    return {
      model: options.model,
      system: request.system,
      messages: toModelMessages(request.messages),
      tools: toToolSet(request.tools),
      ...(options.maxOutputTokens !== undefined
        ? { maxOutputTokens: options.maxOutputTokens }
        : {}),
      ...(options.temperature !== undefined
        ? { temperature: options.temperature }
        : {}),
      ...(options.headers !== undefined
        ? { headers: { ...options.headers } }
        : {}),
    };
  }

  return {
    async complete(request: AgentModelRequest): Promise<AgentModelResponse> {
      const result = await generateText(callSettings(request));
      const toolCalls = result.toolCalls
        .filter((call) => call.invalid !== true)
        .map((call) => ({
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          input: (call.input ?? {}) as JsonValue,
        }));
      return {
        ...(result.text.length > 0 ? { text: result.text } : {}),
        toolCalls,
        stopReason: toStopReason(result.finishReason, toolCalls.length),
        usage: toUsage(result.usage),
      };
    },

    async completeStream(
      request: AgentModelRequest,
      onTextDelta: (delta: string) => void,
    ): Promise<AgentModelResponse> {
      const result = streamText(callSettings(request));
      let text = "";
      for await (const delta of result.textStream) {
        text += delta;
        onTextDelta(delta);
      }
      const [rawToolCalls, finishReason, totalUsage] = await Promise.all([
        result.toolCalls,
        result.finishReason,
        result.usage,
      ]);
      const toolCalls = rawToolCalls
        .filter((call) => call.invalid !== true)
        .map((call) => ({
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          input: (call.input ?? {}) as JsonValue,
        }));
      return {
        ...(text.length > 0 ? { text } : {}),
        toolCalls,
        stopReason: toStopReason(finishReason, toolCalls.length),
        usage: toUsage(totalUsage),
      };
    },
  };
}
