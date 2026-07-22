import type { AgentModelRequest } from "@agentface/assistant";
import {
  defineAgentAction,
  defineAgentFace,
  defineAgentResource,
} from "@agentface/core";
import type { AgentRuntime } from "@agentface/runtime";
import { createAgentRuntime } from "@agentface/runtime";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { describe, expect, it } from "vitest";
import { createAISDKAdapter } from "./adapter.js";
import { createAISDKTools } from "./tools.js";

// ai/test doesn't export the result type; derive it from the mock's
// constructor (doGenerate accepts a function, one result, or an array).
type MockInit = NonNullable<ConstructorParameters<typeof MockLanguageModelV4>[0]>;
type LanguageModelV4GenerateResult = Exclude<
  NonNullable<MockInit["doGenerate"]>,
  ((...args: never[]) => unknown) | readonly unknown[]
>;

type GenerateContent = LanguageModelV4GenerateResult["content"];
type Unified = LanguageModelV4GenerateResult["finishReason"]["unified"];

function generateResult(
  content: GenerateContent,
  unified: Unified,
): LanguageModelV4GenerateResult {
  return {
    content,
    finishReason: { unified, raw: undefined },
    usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
      raw: undefined,
    } as unknown as LanguageModelV4GenerateResult["usage"],
    warnings: [],
  } as LanguageModelV4GenerateResult;
}

const baseRequest: AgentModelRequest = {
  system: "You operate the app.",
  messages: [
    { role: "user", content: [{ type: "text", text: "Send the invoice" }] },
  ],
  tools: [
    {
      name: "billing_invoice__send",
      description: "Send the invoice",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string" } },
        additionalProperties: false,
      },
    },
  ],
};

describe("createAISDKAdapter", () => {
  it("maps tool calls to our response shape with stopReason tool-use", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: generateResult(
        [
          { type: "text", text: "Sending it now." },
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "billing_invoice__send",
            input: JSON.stringify({ message: "hello" }),
          },
        ],
        "tool-calls",
      ),
    });
    const adapter = createAISDKAdapter({ model });
    const response = await adapter.complete(baseRequest);
    expect(response.stopReason).toBe("tool-use");
    expect(response.text).toBe("Sending it now.");
    expect(response.toolCalls).toEqual([
      {
        toolCallId: "call_1",
        toolName: "billing_invoice__send",
        input: { message: "hello" },
      },
    ]);

    // The request reached the model with system + tools and NO execution:
    const call = model.doGenerateCalls[0];
    expect(call).toBeDefined();
    expect(call?.prompt[0]).toMatchObject({ role: "system" });
    expect(call?.tools).toHaveLength(1);
    expect(call?.tools?.[0]).toMatchObject({ name: "billing_invoice__send" });
  });

  it("maps a plain text completion to end-turn", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: generateResult([{ type: "text", text: "All done." }], "stop"),
    });
    const response = await createAISDKAdapter({ model }).complete(baseRequest);
    expect(response).toEqual({
      text: "All done.",
      toolCalls: [],
      stopReason: "end-turn",
      usage: { inputTokens: 1, outputTokens: 1 },
    });
  });

  it("maps content-filter to refusal", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: generateResult([], "content-filter"),
    });
    const response = await createAISDKAdapter({ model }).complete(baseRequest);
    expect(response.stopReason).toBe("refusal");
  });

  it("completeStream emits deltas and resolves the final response with usage", async () => {
    const usage = {
      inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 7, text: 7, reasoning: 0 },
      raw: undefined,
    } as unknown as LanguageModelV4GenerateResult["usage"];
    const model = new MockLanguageModelV4({
      doStream: {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start" as const, warnings: [] },
            { type: "text-start" as const, id: "t1" },
            { type: "text-delta" as const, id: "t1", delta: "Hel" },
            { type: "text-delta" as const, id: "t1", delta: "lo" },
            { type: "text-end" as const, id: "t1" },
            {
              type: "finish" as const,
              usage,
              finishReason: { unified: "stop" as const, raw: undefined },
            },
          ],
        }),
      },
    });
    const adapter = createAISDKAdapter({ model });
    const deltas: string[] = [];
    const response = await adapter.completeStream?.(baseRequest, (delta) =>
      deltas.push(delta),
    );
    expect(deltas.join("")).toBe("Hello");
    expect(response?.text).toBe("Hello");
    expect(response?.stopReason).toBe("end-turn");
    expect(response?.usage).toEqual({ inputTokens: 100, outputTokens: 7 });
  });

  it("splits our user-role tool results into tool-role model messages", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: generateResult([{ type: "text", text: "ok" }], "stop"),
    });
    const adapter = createAISDKAdapter({ model });
    await adapter.complete({
      ...baseRequest,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Send the invoice" }],
        },
        {
          role: "assistant",
          content: [
            { type: "text", text: "Sending." },
            {
              type: "tool-call",
              toolCallId: "call_1",
              toolName: "billing_invoice__send",
              input: {},
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool-result",
              toolCallId: "call_1",
              toolName: "billing_invoice__send",
              result: { outcome: { status: "succeeded" } },
            },
          ],
        },
      ],
    });
    const roles = model.doGenerateCalls[0]?.prompt.map(
      (message) => message.role,
    );
    expect(roles).toEqual(["system", "user", "assistant", "tool"]);
  });
});

function setupRuntime(runtime: AgentRuntime): void {
  const surface = runtime.registerSurface({
    face: defineAgentFace({
      id: "billing.invoice",
      description: "An invoice",
    }),
    entity: { type: "invoice", id: "inv_1" },
  });
  runtime.registerResource(surface.instanceId, {
    definition: defineAgentResource({
      id: "summary",
      description: "Invoice state",
    }),
    getValue: () => ({ status: "draft" }),
  });
  runtime.registerAction(surface.instanceId, {
    definition: defineAgentAction({
      id: "send",
      description: "Send the invoice",
      confirmation: "always",
      preview: () => ({ summary: "Send inv_1" }),
      execute: () => ({ sent: true }),
    }),
  });
  runtime.registerAction(surface.instanceId, {
    definition: defineAgentAction({
      id: "hidden",
      description: "Not for agents",
      execute: () => ({ ok: true }),
    }),
  });
}

async function executeTool(
  tools: Awaited<ReturnType<typeof createAISDKTools>>,
  name: string,
  input: unknown,
): Promise<unknown> {
  const tool = tools[name];
  expect(tool?.execute).toBeDefined();
  const execute = tool?.execute as unknown as (
    input: unknown,
    options: { toolCallId: string; messages: readonly never[] },
  ) => Promise<unknown>;
  return await execute(input, { toolCallId: "call_test", messages: [] });
}

describe("createAISDKTools", () => {
  it("policy-denied actions never become tools", async () => {
    const runtime = createAgentRuntime({
      policy: {
        evaluate: (request) =>
          Promise.resolve(
            request.operation === "inspect-action" &&
              request.actionId === "hidden"
              ? { effect: "deny" as const, reason: "Hidden" }
              : { effect: "allow" as const },
          ),
      },
    });
    setupRuntime(runtime);
    const tools = await createAISDKTools({ runtime });
    const names = Object.keys(tools);
    expect(names).toContain("billing_invoice__send");
    expect(names.some((name) => name.endsWith("__hidden"))).toBe(false);
  });

  it("a confirm-gated action executes only after the callback confirms", async () => {
    const runtime = createAgentRuntime();
    setupRuntime(runtime);
    const confirmed = await createAISDKTools({
      runtime,
      requestConfirmation: async () => "confirmed",
    });
    const result = (await executeTool(
      confirmed,
      "billing_invoice__send",
      {},
    )) as { outcome?: { status?: string }; preview?: string };
    expect(result.outcome?.status).toBe("succeeded");
    expect(result.preview).toBe("Send inv_1");
  });

  it("defaults to declining confirmation-required actions", async () => {
    const runtime = createAgentRuntime();
    setupRuntime(runtime);
    const tools = await createAISDKTools({ runtime });
    const result = (await executeTool(tools, "billing_invoice__send", {})) as {
      declined?: boolean;
    };
    expect(result.declined).toBe(true);
    // Nothing executed: the invoice action never ran.
    const executed = runtime
      .getTraceEvents()
      .filter((event) => event.type === "action.executing");
    expect(executed).toHaveLength(0);
  });

  it("read_resource reads through the runtime", async () => {
    const runtime = createAgentRuntime();
    setupRuntime(runtime);
    const tools = await createAISDKTools({ runtime });
    const discovery = await runtime.discover();
    const instanceId = discovery.surfaces[0]?.instance.instanceId ?? "";
    const result = (await executeTool(tools, "read_resource", {
      instanceId,
      resourceId: "summary",
    })) as { value?: { status?: string } };
    expect(result.value?.status).toBe("draft");
  });
});
