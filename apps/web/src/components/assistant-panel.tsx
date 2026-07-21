"use client";

import type {
  AgentModelAdapter,
  AgentModelRequest,
  AgentModelResponse,
  AssistantMessage,
  MockScriptStep,
} from "@agentface/assistant";
import { createAssistant, createMockModelAdapter } from "@agentface/assistant";
import { useAgentRuntime } from "@agentface/react";
import type { PreparedAgentAction } from "@agentface/runtime";
import { useRef, useState } from "react";

type AdapterKind = "bedrock" | "mock";

/** Calls the server-side Bedrock route; the loop itself stays in the browser. */
const httpAdapter: AgentModelAdapter = {
  async complete(request: AgentModelRequest): Promise<AgentModelResponse> {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    const body = (await response.json()) as
      | AgentModelResponse
      | { error: string };
    if (!response.ok || "error" in body) {
      throw new Error("error" in body ? body.error : `HTTP ${response.status}`);
    }
    return body;
  },
};

/**
 * The deterministic demo: the MISSION Phase-6 acceptance instruction against
 * the invoice example. Steps resolve tool names at call time, so it works
 * regardless of instance ids.
 */
function buildDemoScript(): readonly MockScriptStep[] {
  const findTool = (request: AgentModelRequest, suffix: string) =>
    request.tools.find((tool) => tool.name.endsWith(suffix))?.name;
  return [
    (request) => {
      const addLineItem = findTool(request, "__add-line-item");
      if (addLineItem === undefined) {
        return {
          text: "The demo script drives the invoice example — open /examples/invoice and try again.",
          toolCalls: [],
          stopReason: "end-turn",
        };
      }
      return {
        text: "Adding the consulting line item.",
        toolCalls: [
          {
            toolCallId: "demo_1",
            toolName: addLineItem,
            input: { description: "Consulting", quantity: 1, unitPrice: 100 },
          },
        ],
        stopReason: "tool-use",
      };
    },
    (request) => {
      const send = findTool(request, "__send");
      if (send === undefined) {
        return { text: "Done.", toolCalls: [], stopReason: "end-turn" };
      }
      return {
        text: "Line item added. Preparing the invoice for sending — please confirm.",
        toolCalls: [{ toolCallId: "demo_2", toolName: send, input: {} }],
        stopReason: "tool-use",
      };
    },
    { text: "All done.", toolCalls: [], stopReason: "end-turn" },
  ];
}

interface PendingConfirmation {
  readonly prepared: PreparedAgentAction;
  readonly resolve: (decision: "confirmed" | "declined") => void;
}

const DEMO_INSTRUCTION =
  "Add a £100 consulting line item and prepare the invoice for sending.";

export function AssistantPanel(): React.JSX.Element {
  const runtime = useAgentRuntime();
  const [open, setOpen] = useState(false);
  const [adapterKind, setAdapterKind] = useState<AdapterKind>("mock");
  const [messages, setMessages] = useState<readonly AssistantMessage[]>([]);
  const [input, setInput] = useState(DEMO_INSTRUCTION);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const bedrockAssistant = useRef<ReturnType<typeof createAssistant> | null>(
    null,
  );

  const requestConfirmation = (
    prepared: PreparedAgentAction,
  ): Promise<"confirmed" | "declined"> =>
    new Promise((resolve) => {
      setPending({
        prepared,
        resolve: (decision) => {
          setPending(null);
          resolve(decision);
        },
      });
    });

  async function send(): Promise<void> {
    const text = input.trim();
    if (text.length === 0 || busy) {
      return;
    }
    setBusy(true);
    try {
      let assistant;
      if (adapterKind === "mock") {
        // The mock script is single-shot; each send gets a fresh conversation.
        assistant = createAssistant({
          runtime,
          adapter: createMockModelAdapter(buildDemoScript()),
          requestConfirmation,
          onUpdate: () => {},
        });
      } else {
        bedrockAssistant.current ??= createAssistant({
          runtime,
          adapter: httpAdapter,
          requestConfirmation,
        });
        assistant = bedrockAssistant.current;
      }
      await assistant.send(text);
      setMessages(assistant.getMessages());
      setInput("");
    } catch (caught) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: `Error: ${caught instanceof Error ? caught.message : String(caught)}`,
            },
          ],
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="m-2 rounded-lg border border-neutral-300 font-mono text-xs dark:border-neutral-700">
      <div className="flex items-center justify-between bg-neutral-100 px-3 py-1.5 dark:bg-neutral-900">
        <span className="font-bold">AgentFace Assistant</span>
        <div className="flex items-center gap-2">
          <select
            aria-label="Model adapter"
            className="rounded border border-neutral-300 px-1 py-0.5 dark:border-neutral-700 dark:bg-neutral-900"
            value={adapterKind}
            onChange={(event) =>
              setAdapterKind(event.target.value as AdapterKind)
            }
          >
            <option value="mock">Demo script (mock)</option>
            <option value="bedrock">Claude (Bedrock)</option>
          </select>
          <button
            type="button"
            className="rounded border border-neutral-300 px-2 py-0.5 dark:border-neutral-700"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
          >
            {open ? "Close assistant" : "Open assistant"}
          </button>
        </div>
      </div>
      {open ? (
        <div className="space-y-2 p-3">
          <div className="max-h-64 space-y-2 overflow-y-auto" data-testid="assistant-messages">
            {messages.map((message, messageIndex) => (
              <div key={messageIndex}>
                {message.content.map((part, partIndex) => {
                  if (part.type === "text") {
                    return (
                      <p
                        key={partIndex}
                        className={
                          message.role === "user"
                            ? "font-semibold"
                            : "text-neutral-700 dark:text-neutral-300"
                        }
                      >
                        {message.role === "user" ? "You: " : "Assistant: "}
                        {part.text}
                      </p>
                    );
                  }
                  if (part.type === "tool-call") {
                    return (
                      <p key={partIndex} className="text-neutral-500">
                        → {part.toolName}({JSON.stringify(part.input)})
                      </p>
                    );
                  }
                  return (
                    <p key={partIndex} className="text-neutral-500">
                      ← {part.isError === true ? "error: " : ""}
                      {JSON.stringify(part.result).slice(0, 200)}
                    </p>
                  );
                })}
              </div>
            ))}
          </div>

          {pending !== null ? (
            <div
              className="rounded border border-amber-400 bg-amber-50 p-2 dark:border-amber-600 dark:bg-amber-950"
              data-testid="confirmation-card"
            >
              <p className="font-semibold">Confirmation required</p>
              <p>{pending.prepared.preview?.summary ?? pending.prepared.actionId}</p>
              {pending.prepared.confirmationReason !== undefined ? (
                <p className="text-neutral-600 dark:text-neutral-400">
                  {pending.prepared.confirmationReason}
                </p>
              ) : null}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="rounded bg-amber-600 px-3 py-1 text-white"
                  onClick={() => pending.resolve("confirmed")}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  className="rounded border border-neutral-400 px-3 py-1"
                  onClick={() => pending.resolve("declined")}
                >
                  Decline
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex gap-2">
            <input
              aria-label="Assistant instruction"
              className="flex-1 rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void send();
                }
              }}
            />
            <button
              type="button"
              className="rounded bg-neutral-800 px-3 py-1 text-white disabled:opacity-50 dark:bg-neutral-200 dark:text-neutral-900"
              disabled={busy}
              onClick={() => void send()}
            >
              {busy ? "Working…" : "Send"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
