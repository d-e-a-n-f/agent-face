import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import type { JsonValue } from "@agentface/core";
import type {
  AgentModelAdapter,
  AgentModelStopReason,
  AssistantContentPart,
} from "./types.js";

/**
 * Options for {@link createBedrockAdapter}. AWS credentials resolve via the
 * standard AWS SDK chain (environment, profile, instance role) — this adapter
 * must run server-side, never in a browser.
 */
export interface BedrockAdapterOptions {
  /** AWS region; falls back to the `AWS_REGION` environment variable. */
  readonly awsRegion?: string;
  /** Bedrock model id (with the `anthropic.` prefix). Default `anthropic.claude-opus-4-8`. */
  readonly model?: string;
  /** Max output tokens per completion. Default 16000. */
  readonly maxTokens?: number;
  /** Injectable client for tests. */
  readonly client?: AnthropicBedrockMantle;
}

function toBedrockContent(
  parts: readonly AssistantContentPart[],
): Array<Record<string, unknown>> {
  return parts.map((part) => {
    switch (part.type) {
      case "text":
        return { type: "text", text: part.text };
      case "tool-call":
        return {
          type: "tool_use",
          id: part.toolCallId,
          name: part.toolName,
          input: part.input,
        };
      case "tool-result":
        return {
          type: "tool_result",
          tool_use_id: part.toolCallId,
          content: JSON.stringify(part.result),
          ...(part.isError === true ? { is_error: true } : {}),
        };
      default: {
        const exhaustive: never = part;
        return exhaustive;
      }
    }
  });
}

function toStopReason(raw: string | null): AgentModelStopReason {
  switch (raw) {
    case "end_turn":
    case "stop_sequence":
      return "end-turn";
    case "tool_use":
      return "tool-use";
    case "refusal":
      return "refusal";
    default:
      return "other";
  }
}

/**
 * A model adapter backed by Claude on Amazon Bedrock.
 *
 * Server-side only. Region is required (option or `AWS_REGION`); credentials
 * come from the AWS SDK chain. Uses adaptive thinking.
 *
 * @example
 * ```ts
 * // In a Next.js route handler:
 * const adapter = createBedrockAdapter({ awsRegion: "us-east-1" });
 * const response = await adapter.complete(request);
 * ```
 */
export function createBedrockAdapter(
  options: BedrockAdapterOptions = {},
): AgentModelAdapter {
  const region = options.awsRegion ?? process.env["AWS_REGION"];
  if (region === undefined || region.length === 0) {
    throw new Error(
      "createBedrockAdapter requires an AWS region: pass awsRegion or set AWS_REGION",
    );
  }
  const client =
    options.client ?? new AnthropicBedrockMantle({ awsRegion: region });
  const model = options.model ?? "anthropic.claude-opus-4-8";
  const maxTokens = options.maxTokens ?? 16000;

  return {
    async complete(request) {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        thinking: { type: "adaptive" },
        system: request.system,
        messages: request.messages.map((message) => ({
          role: message.role,
          content: toBedrockContent(message.content),
        })) as never,
        tools: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        })) as never,
      });

      let text = "";
      const toolCalls: {
        toolCallId: string;
        toolName: string;
        input: JsonValue;
      }[] = [];
      for (const block of response.content) {
        if (block.type === "text") {
          text += block.text;
        } else if (block.type === "tool_use") {
          toolCalls.push({
            toolCallId: block.id,
            toolName: block.name,
            // Validated downstream by the action's own input schema.
            input: block.input as JsonValue,
          });
        }
      }

      return {
        ...(text.length > 0 ? { text } : {}),
        toolCalls,
        stopReason: toStopReason(response.stop_reason),
      };
    },
  };
}
