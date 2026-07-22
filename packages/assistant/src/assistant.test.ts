import type { AgentInputSchema } from "@agentface/core";
import {
  AgentFaceError,
  defineAgentAction,
  defineAgentFace,
  defineAgentResource,
} from "@agentface/core";
import { createPolicyEngine } from "@agentface/policy";
import type { AgentRuntime, AgentSurfaceRegistration } from "@agentface/runtime";
import { createAgentRuntime } from "@agentface/runtime";
import { describe, expect, it } from "vitest";
import { createAssistant } from "./assistant.js";
import { createMockModelAdapter } from "./mock.js";
import type { AgentModelRequest, AssistantContentPart } from "./types.js";

interface LineItemInput {
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

function objectSchema<T>(check: (input: unknown) => input is T): AgentInputSchema<T> {
  return {
    parse(input: unknown): T {
      if (!check(input)) {
        throw new AgentFaceError({
          code: "INVALID_INPUT",
          message: "Invalid input shape",
        });
      }
      return input;
    },
    toJSONSchema: () => ({ type: "object" }),
  };
}

const lineItemSchema = objectSchema<LineItemInput>(
  (input): input is LineItemInput =>
    typeof input === "object" &&
    input !== null &&
    typeof (input as LineItemInput).description === "string" &&
    typeof (input as LineItemInput).quantity === "number" &&
    typeof (input as LineItemInput).unitPrice === "number",
);

const emptySchema = objectSchema<Record<string, never>>(
  (input): input is Record<string, never> =>
    typeof input === "object" && input !== null,
);

interface Invoice {
  status: "draft" | "sent";
  lineItems: { description: string; quantity: number; unitPrice: number }[];
}

function setupInvoice(runtime: AgentRuntime): {
  invoice: Invoice;
  surface: AgentSurfaceRegistration;
} {
  const invoice: Invoice = { status: "draft", lineItems: [] };
  const surface = runtime.registerSurface({
    face: defineAgentFace({
      id: "billing.invoice",
      name: "Invoice",
      description: "View, edit and send a customer invoice",
      version: "0.1.0",
    }),
    entity: { type: "invoice", id: "inv_9821" },
  });
  runtime.registerResource(surface.instanceId, {
    definition: defineAgentResource<Invoice>({
      id: "summary",
      name: "Invoice summary",
      description: "Current invoice state",
      serialize: (value) => ({
        status: value.status,
        lineItems: value.lineItems,
      }),
    }),
    getValue: () => invoice,
  });
  runtime.registerAction(surface.instanceId, {
    definition: defineAgentAction({
      id: "add-line-item",
      name: "Add line item",
      description: "Add a line item to the draft invoice",
      input: lineItemSchema,
      execute: (input) => {
        invoice.lineItems.push({ ...input });
        surface.bumpRevision();
        return { added: true, count: invoice.lineItems.length };
      },
    }),
  });
  runtime.registerAction(surface.instanceId, {
    definition: defineAgentAction({
      id: "send",
      name: "Send invoice",
      description: "Send the invoice to the customer",
      input: emptySchema,
      confirmation: "always",
      preview: () => ({
        summary: `Send invoice with ${invoice.lineItems.length} line item(s)`,
        changes: [{ path: "status", from: "draft", to: "sent" }],
      }),
      execute: () => {
        invoice.status = "sent";
        surface.bumpRevision();
        return { sent: true };
      },
    }),
  });
  return { invoice, surface };
}

function findToolName(request: AgentModelRequest, suffix: string): string {
  const tool = request.tools.find((candidate) => candidate.name.endsWith(suffix));
  if (tool === undefined) {
    throw new Error(`No tool ending with "${suffix}" in ${request.tools.map((t) => t.name).join(", ")}`);
  }
  return tool.name;
}

function toolResults(
  messages: readonly { content: readonly AssistantContentPart[] }[],
): readonly Extract<AssistantContentPart, { type: "tool-result" }>[] {
  return messages.flatMap((message) =>
    message.content.filter(
      (part): part is Extract<AssistantContentPart, { type: "tool-result" }> =>
        part.type === "tool-result",
    ),
  );
}

describe("createAssistant", () => {
  it("MVP multi-action operation: adds a £100 consulting line item and prepares the invoice for sending", async () => {
    // One instruction chains two actions without bypassing policy or
    // confirmation.
    const runtime = createAgentRuntime();
    const { invoice } = setupInvoice(runtime);
    const confirmations: string[] = [];

    const adapter = createMockModelAdapter([
      (request) => ({
        toolCalls: [
          {
            toolCallId: "call_1",
            toolName: findToolName(request, "__add-line-item"),
            input: { description: "Consulting", quantity: 1, unitPrice: 100 },
          },
        ],
        stopReason: "tool-use",
      }),
      (request) => ({
        text: "Line item added. Now sending the invoice for your confirmation.",
        toolCalls: [
          {
            toolCallId: "call_2",
            toolName: findToolName(request, "__send"),
            input: {},
          },
        ],
        stopReason: "tool-use",
      }),
      {
        text: "Done — the invoice was sent after your confirmation.",
        toolCalls: [],
        stopReason: "end-turn",
      },
    ]);

    const assistant = createAssistant({
      runtime,
      adapter,
      requestConfirmation: (prepared) => {
        confirmations.push(prepared.preview?.summary ?? "");
        return Promise.resolve("confirmed");
      },
    });

    await assistant.send(
      "Add a £100 consulting line item and prepare the invoice for sending.",
    );

    // Both actions ran, in order, through the runtime.
    expect(invoice.lineItems).toEqual([
      { description: "Consulting", quantity: 1, unitPrice: 100 },
    ]);
    expect(invoice.status).toBe("sent");
    // The user saw the exact preview and confirmed exactly once.
    expect(confirmations).toEqual(["Send invoice with 1 line item(s)"]);
    // The trace shows the full policy-mediated lifecycle for the send.
    const trace = runtime.getTraceEvents().map((event) => event.type);
    for (const expected of [
      "action.prepared",
      "action.confirmation-required",
      "action.confirmed",
      "action.succeeded",
    ]) {
      expect(trace).toContain(expected);
    }
  });

  it("a declined confirmation prevents execution and informs the model", async () => {
    const runtime = createAgentRuntime();
    const { invoice } = setupInvoice(runtime);

    const adapter = createMockModelAdapter([
      (request) => ({
        toolCalls: [
          {
            toolCallId: "call_1",
            toolName: findToolName(request, "__send"),
            input: {},
          },
        ],
        stopReason: "tool-use",
      }),
      { text: "Understood — I won't send it.", toolCalls: [], stopReason: "end-turn" },
    ]);

    const assistant = createAssistant({
      runtime,
      adapter,
      requestConfirmation: () => Promise.resolve("declined"),
    });
    const turn = await assistant.send("Send the invoice.");

    expect(invoice.status).toBe("draft");
    const [result] = toolResults(turn);
    expect(result?.result).toMatchObject({ declined: true });
    expect(
      runtime.getTraceEvents().some((event) => event.type === "action.executing"),
    ).toBe(false);
  });

  it("defaults to declining confirmations when no handler is provided", async () => {
    const runtime = createAgentRuntime();
    const { invoice } = setupInvoice(runtime);
    const adapter = createMockModelAdapter([
      (request) => ({
        toolCalls: [
          { toolCallId: "c1", toolName: findToolName(request, "__send"), input: {} },
        ],
        stopReason: "tool-use",
      }),
      { toolCalls: [], stopReason: "end-turn" },
    ]);
    const assistant = createAssistant({ runtime, adapter });
    await assistant.send("Send it.");
    expect(invoice.status).toBe("draft");
  });

  it("reads resources through the runtime", async () => {
    const runtime = createAgentRuntime();
    setupInvoice(runtime);
    const adapter = createMockModelAdapter([
      (request) => {
        const surfaces = JSON.parse(
          request.system.split("## Currently mounted surfaces\n")[1] ?? "[]",
        ) as { instanceId: string }[];
        return {
          toolCalls: [
            {
              toolCallId: "c1",
              toolName: "read_resource",
              input: {
                instanceId: surfaces[0]?.instanceId ?? "",
                resourceId: "summary",
              },
            },
          ],
          stopReason: "tool-use",
        };
      },
      { text: "The invoice is a draft.", toolCalls: [], stopReason: "end-turn" },
    ]);
    const assistant = createAssistant({ runtime, adapter });
    const turn = await assistant.send("What's the invoice status?");
    const [result] = toolResults(turn);
    expect(result?.result).toMatchObject({
      value: { status: "draft", lineItems: [] },
    });
  });

  it("policy denials reach the model as structured errors, not thrown failures", async () => {
    const denied = createAgentRuntime({
      policy: createPolicyEngine([
        {
          id: "deny-execute",
          evaluate: (request) =>
            request.operation === "execute-action"
              ? {
                  effect: "deny",
                  reason: "Executions are disabled for agents",
                }
              : undefined,
        },
      ]),
    });
    const { invoice } = setupInvoice(denied);

    const adapter = createMockModelAdapter([
      (request) => ({
        toolCalls: [
          {
            toolCallId: "c1",
            toolName: findToolName(request, "__add-line-item"),
            input: { description: "X", quantity: 1, unitPrice: 1 },
          },
        ],
        stopReason: "tool-use",
      }),
      { text: "I wasn't allowed to do that.", toolCalls: [], stopReason: "end-turn" },
    ]);
    const assistant = createAssistant({ runtime: denied, adapter });
    const turn = await assistant.send("Add a line item.");

    expect(invoice.lineItems).toHaveLength(0);
    const [result] = toolResults(turn);
    expect(result?.isError).toBe(true);
    expect(result?.result).toMatchObject({ code: "POLICY_DENIED" });
  });

  it("stops at the iteration limit instead of looping forever", async () => {
    const runtime = createAgentRuntime();
    setupInvoice(runtime);
    const adapter = createMockModelAdapter(
      Array.from({ length: 10 }, (_, index) => (request: AgentModelRequest) => ({
        toolCalls: [
          {
            toolCallId: `c${index}`,
            toolName: findToolName(request, "read_resource"),
            input: { instanceId: "nope", resourceId: "nope" },
          },
        ],
        stopReason: "tool-use" as const,
      })),
    );
    const assistant = createAssistant({ runtime, adapter, maxIterations: 3 });
    const turn = await assistant.send("Loop forever.");
    const assistantTurns = turn.filter((message) => message.role === "assistant");
    expect(assistantTurns).toHaveLength(3);
  });

  it("exposes discovery to the model and refreshes tools between iterations", async () => {
    const runtime = createAgentRuntime();
    setupInvoice(runtime);
    const seenToolCounts: number[] = [];
    const adapter = createMockModelAdapter([
      (request) => {
        seenToolCounts.push(request.tools.length);
        return {
          toolCalls: [
            { toolCallId: "c1", toolName: "discover_surfaces", input: {} },
          ],
          stopReason: "tool-use",
        };
      },
      (request) => {
        seenToolCounts.push(request.tools.length);
        return { text: "Found it.", toolCalls: [], stopReason: "end-turn" };
      },
    ]);
    const assistant = createAssistant({ runtime, adapter });
    const turn = await assistant.send("What can you see?");
    const [result] = toolResults(turn);
    expect(result?.result).toMatchObject([
      { face: { id: "billing.invoice" } },
    ]);
    // discover_surfaces + read_resource + 2 actions, on both iterations.
    expect(seenToolCounts).toEqual([4, 4]);
  });

  it("a policy-denied action never becomes a model tool", async () => {
    const runtime = createAgentRuntime({
      policy: {
        evaluate: (request) =>
          Promise.resolve(
            request.operation === "inspect-action" && request.actionId === "send"
              ? { effect: "deny" as const, reason: "Hidden from agents" }
              : { effect: "allow" as const },
          ),
      },
    });
    setupInvoice(runtime);
    let seenTools: readonly string[] = [];
    const assistant = createAssistant({
      runtime,
      adapter: createMockModelAdapter([
        (request) => {
          seenTools = request.tools.map((tool) => tool.name);
          return { toolCalls: [], stopReason: "end-turn", text: "ok" };
        },
      ]),
    });
    await assistant.send("What can you do?");
    expect(seenTools.some((name) => name.endsWith("__send"))).toBe(false);
    expect(seenTools.some((name) => name.endsWith("__add-line-item"))).toBe(
      true,
    );
  });

  it("tool-name collisions on long shared prefixes resolve without looping", async () => {
    const runtime = createAgentRuntime();
    // Two surfaces of the same face: identical action tool names whose
    // sanitised base is exactly at the 64-character cap.
    const face = defineAgentFace({
      id: "a".repeat(48),
      description: "Long-id face",
    });
    for (let index = 0; index < 3; index += 1) {
      const surface = runtime.registerSurface({ face });
      runtime.registerAction(surface.instanceId, {
        definition: defineAgentAction({
          id: "b".repeat(20),
          description: "Long-id action",
          execute: () => ({ ok: true }),
        }),
      });
    }
    let seenTools: readonly string[] = [];
    const assistant = createAssistant({
      runtime,
      adapter: createMockModelAdapter([
        (request) => {
          seenTools = request.tools.map((tool) => tool.name);
          return { toolCalls: [], stopReason: "end-turn", text: "ok" };
        },
      ]),
    });
    await assistant.send("hello");
    const actionTools = seenTools.filter((name) => name.startsWith("aaaa"));
    expect(actionTools).toHaveLength(3);
    expect(new Set(actionTools).size).toBe(3);
    for (const name of actionTools) {
      expect(name.length).toBeLessThanOrEqual(64);
    }
  });

  it("concurrent sends queue instead of interleaving", async () => {
    const runtime = createAgentRuntime();
    setupInvoice(runtime);
    const order: string[] = [];
    const assistant = createAssistant({
      runtime,
      adapter: {
        complete: async (request) => {
          const text = request.messages
            .filter((message) => message.role === "user")
            .at(-1)
            ?.content.find((part) => part.type === "text");
          const label = text?.type === "text" ? text.text : "?";
          order.push(`start:${label}`);
          await new Promise((resolve) => setTimeout(resolve, 5));
          order.push(`end:${label}`);
          return { toolCalls: [], stopReason: "end-turn" as const, text: "ok" };
        },
      },
    });
    await Promise.all([assistant.send("first"), assistant.send("second")]);
    expect(order).toEqual([
      "start:first",
      "end:first",
      "start:second",
      "end:second",
    ]);
  });

  it("cancel() stops the loop before the next model round-trip", async () => {
    const runtime = createAgentRuntime();
    const { surface } = setupInvoice(runtime);
    let completions = 0;
    const assistant = createAssistant({
      runtime,
      adapter: {
        complete: async (request) => {
          completions += 1;
          // A real model round-trip crosses the event loop; without this
          // the whole loop would finish in microtasks before cancel() runs.
          await new Promise((resolve) => setTimeout(resolve, 1));
          // Keep asking for another read forever; only cancel stops it.
          const read = request.tools.find((tool) => tool.name === "read_resource");
          return {
            toolCalls: [
              {
                toolCallId: `call_${completions}`,
                toolName: read?.name ?? "read_resource",
                input: {
                  instanceId: surface.instanceId,
                  resourceId: "summary",
                } as never,
              },
            ],
            stopReason: "tool-use" as const,
          };
        },
      },
    });
    const run = assistant.send("loop forever");
    // Let one round-trip land, then cancel.
    await new Promise((resolve) => setTimeout(resolve, 0));
    assistant.cancel();
    await run;
    expect(completions).toBeLessThan(12);
  });
});
