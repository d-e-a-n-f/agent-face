import type { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import { describe, expect, it } from "vitest";
import { createBedrockAdapter } from "./bedrock.js";
import type { AgentModelRequest } from "./types.js";

const request: AgentModelRequest = {
  system: "test",
  messages: [{ role: "user", content: [{ type: "text", text: "send it" }] }],
  tools: [
    {
      name: "billing_invoice__send",
      description: "Send",
      inputSchema: { type: "object" },
    },
  ],
};

/** Streaming events as Bedrock emits them, tool input as partial JSON. */
const STREAM_EVENTS = [
  {
    type: "message_start",
    message: { usage: { input_tokens: 200, output_tokens: 1 } },
  },
  { type: "content_block_start", index: 0, content_block: { type: "text" } },
  {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "Sending " },
  },
  {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "now." },
  },
  { type: "content_block_stop", index: 0 },
  {
    type: "content_block_start",
    index: 1,
    content_block: { type: "tool_use", id: "call_1", name: "billing_invoice__send" },
  },
  {
    type: "content_block_delta",
    index: 1,
    delta: { type: "input_json_delta", partial_json: '{"mess' },
  },
  {
    type: "content_block_delta",
    index: 1,
    delta: { type: "input_json_delta", partial_json: 'age":"hi"}' },
  },
  { type: "content_block_stop", index: 1 },
  {
    type: "message_delta",
    delta: { stop_reason: "tool_use" },
    usage: { output_tokens: 25 },
  },
  { type: "message_stop" },
];

function fakeClient(): AnthropicBedrockMantle {
  return {
    messages: {
      create: async (params: { stream?: boolean }) => {
        if (params.stream === true) {
          return (async function* () {
            for (const event of STREAM_EVENTS) {
              yield event;
            }
          })();
        }
        return {
          content: [{ type: "text", text: "done" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 2 },
        };
      },
    },
  } as unknown as AnthropicBedrockMantle;
}

describe("createBedrockAdapter", () => {
  it("reports usage on plain completions", async () => {
    const adapter = createBedrockAdapter({
      awsRegion: "us-east-1",
      client: fakeClient(),
    });
    const response = await adapter.complete(request);
    expect(response.usage).toEqual({ inputTokens: 10, outputTokens: 2 });
  });

  it("streams text deltas and assembles tool calls from partial JSON", async () => {
    const adapter = createBedrockAdapter({
      awsRegion: "us-east-1",
      client: fakeClient(),
    });
    const deltas: string[] = [];
    const response = await adapter.completeStream?.(request, (delta) =>
      deltas.push(delta),
    );
    expect(deltas).toEqual(["Sending ", "now."]);
    expect(response?.text).toBe("Sending now.");
    expect(response?.toolCalls).toEqual([
      {
        toolCallId: "call_1",
        toolName: "billing_invoice__send",
        input: { message: "hi" },
      },
    ]);
    expect(response?.stopReason).toBe("tool-use");
    expect(response?.usage).toEqual({ inputTokens: 200, outputTokens: 25 });
  });
});
