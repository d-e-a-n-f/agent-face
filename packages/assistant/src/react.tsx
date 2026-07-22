"use client";

import { useAgentContext, useAgentRecommendations } from "@agentface/react";
import type { PreparedAgentAction, PrincipalContext } from "@agentface/runtime";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentFaceAssistant as AssistantEngine, ConfirmationDecision } from "./assistant.js";
import { createAssistant } from "./assistant.js";
import { createHttpModelAdapter } from "./http.js";
import type { AgentModelAdapter, AssistantMessage } from "./types.js";

/** Options for {@link useAgentFaceAssistant}. */
export interface UseAgentFaceAssistantOptions {
  /** Model adapter. Defaults to the HTTP adapter at `endpoint`. */
  readonly adapter?: AgentModelAdapter;
  /** Model endpoint URL for the default HTTP adapter. Default `/api/agentface`. */
  readonly endpoint?: string;
  readonly systemPrompt?: string;
  readonly maxIterations?: number;
}

/** The headless assistant state for building custom chat UIs. */
export interface UseAgentFaceAssistantResult {
  readonly messages: readonly AssistantMessage[];
  readonly busy: boolean;
  /** The prepared action currently awaiting the user's decision, if any. */
  readonly pendingConfirmation: PreparedAgentAction | null;
  send(text: string): Promise<void>;
  /** Stops the current run before its next model round-trip. */
  cancel(): void;
  confirm(): void;
  decline(): void;
  reset(): void;
}

/**
 * Headless assistant hook: owns the conversation, the model round-trips, and
 * the confirmation gate, leaving rendering entirely to the caller. The
 * shipped {@link AgentFaceAssistant} widget is built on this hook — use the
 * hook directly to build your own chat surface.
 *
 * Must be used inside an `<AgentFaceProvider>`.
 */
export function useAgentFaceAssistant(
  options: UseAgentFaceAssistantOptions = {},
): UseAgentFaceAssistantResult {
  const context = useAgentContext();
  const runtime = context.runtime;
  const [messages, setMessages] = useState<readonly AssistantMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PreparedAgentAction | null>(null);
  const decisionRef = useRef<((decision: ConfirmationDecision) => void) | null>(
    null,
  );

  // The provider's principals flow into every runtime operation the
  // assistant performs. A ref + closure keeps them current per operation
  // without recreating the engine (login/logout applies immediately).
  const principalsRef = useRef<PrincipalContext>({});
  principalsRef.current = {
    ...(context.user !== undefined ? { user: context.user } : {}),
    ...(context.agent !== undefined ? { agent: context.agent } : {}),
  };

  const adapter = useMemo(
    () =>
      options.adapter ??
      createHttpModelAdapter(
        options.endpoint !== undefined ? { url: options.endpoint } : {},
      ),
    [options.adapter, options.endpoint],
  );

  const engineRef = useRef<AssistantEngine | null>(null);
  const engineAdapterRef = useRef<AgentModelAdapter | null>(null);
  if (engineRef.current === null || engineAdapterRef.current !== adapter) {
    engineAdapterRef.current = adapter;
    engineRef.current = createAssistant({
      runtime,
      adapter,
      principals: () => principalsRef.current,
      ...(options.systemPrompt !== undefined
        ? { systemPrompt: options.systemPrompt }
        : {}),
      ...(options.maxIterations !== undefined
        ? { maxIterations: options.maxIterations }
        : {}),
      requestConfirmation: (prepared) =>
        new Promise<ConfirmationDecision>((resolve) => {
          decisionRef.current = resolve;
          setPending(prepared);
        }),
      onUpdate: () => {
        setMessages(engineRef.current?.getMessages() ?? []);
      },
    });
  }

  const settle = useCallback((decision: ConfirmationDecision): void => {
    const resolve = decisionRef.current;
    decisionRef.current = null;
    setPending(null);
    resolve?.(decision);
  }, []);

  const send = useCallback(
    async (text: string): Promise<void> => {
      const engine = engineRef.current;
      if (engine === null || text.trim().length === 0) {
        return;
      }
      setBusy(true);
      try {
        await engine.send(text.trim());
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
    },
    [],
  );

  return {
    messages,
    busy,
    pendingConfirmation: pending,
    send,
    cancel: useCallback(() => {
      engineRef.current?.cancel();
      // A pending confirmation belongs to the cancelled run: decline it so
      // the awaiting promise settles.
      const resolve = decisionRef.current;
      decisionRef.current = null;
      setPending(null);
      resolve?.("declined");
    }, []),
    confirm: useCallback(() => settle("confirmed"), [settle]),
    decline: useCallback(() => settle("declined"), [settle]),
    reset: useCallback(() => {
      engineRef.current?.reset();
      setMessages([]);
    }, []),
  };
}

/** Props for the shipped {@link AgentFaceAssistant} widget. */
export interface AgentFaceAssistantProps extends UseAgentFaceAssistantOptions {
  /** Widget title. Default "Assistant". */
  readonly title?: string;
  /** Input placeholder. */
  readonly placeholder?: string;
  /** Where the widget floats; `"inline"` renders in normal flow. Default `"bottom-right"`. */
  readonly position?: "bottom-right" | "bottom-left" | "inline";
  readonly defaultOpen?: boolean;
  /** Show suggested actions from the mounted surfaces as tappable chips. Default true. */
  readonly suggestions?: boolean;
}

const styles = {
  launcher: {
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    fontSize: 13,
    border: "1px solid #7b6ff0",
    borderRadius: 999,
    background: "#7b6ff0",
    color: "#fff",
    padding: "8px 16px",
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(30, 20, 80, 0.25)",
  },
  panel: {
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    fontSize: 13,
    width: 400,
    maxWidth: "calc(100vw - 32px)",
    display: "flex",
    flexDirection: "column",
    border: "1px solid #d0d0da",
    borderRadius: 12,
    background: "#ffffff",
    color: "#1a1a2e",
    boxShadow: "0 8px 30px rgba(30, 20, 80, 0.2)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    background: "#eceaf6",
    borderBottom: "1px solid #d0d0da",
    fontWeight: 700,
  },
  headerButton: {
    border: "none",
    background: "none",
    cursor: "pointer",
    font: "inherit",
    color: "#5b5878",
  },
  messages: {
    minHeight: 80,
    maxHeight: "min(480px, 60vh)",
    overflowY: "auto",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  emptyState: { color: "#807d99", textAlign: "center", margin: "24px 0" },
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "85%",
    background: "#7b6ff0",
    color: "#fff",
    borderRadius: "14px 14px 4px 14px",
    padding: "7px 12px",
    margin: 0,
    whiteSpace: "pre-wrap",
  },
  assistantBubble: {
    alignSelf: "flex-start",
    maxWidth: "85%",
    background: "#f4f3f8",
    color: "#2a2840",
    borderRadius: "14px 14px 14px 4px",
    padding: "7px 12px",
    margin: 0,
    whiteSpace: "pre-wrap",
  },
  toolLine: {
    alignSelf: "flex-start",
    color: "#807d99",
    fontSize: 11,
    margin: "0 0 0 4px",
  },
  workingRow: {
    alignSelf: "flex-start",
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#f4f3f8",
    borderRadius: "14px 14px 14px 4px",
    padding: "8px 12px",
    color: "#5b5878",
  },
  confirmation: {
    margin: "0 12px",
    border: "1px solid #ecc46f",
    background: "#fdf4dd",
    borderRadius: 8,
    padding: 10,
  },
  confirmButton: {
    border: "1px solid #b8860b",
    borderRadius: 6,
    background: "#d99e17",
    color: "#fff",
    padding: "4px 12px",
    cursor: "pointer",
    font: "inherit",
    marginRight: 8,
  },
  declineButton: {
    border: "1px solid #b5b2c9",
    borderRadius: 6,
    background: "#fff",
    color: "#1a1a2e",
    padding: "4px 12px",
    cursor: "pointer",
    font: "inherit",
  },
  suggestions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    padding: "0 12px",
  },
  chip: {
    border: "1px solid #b5a8f5",
    borderRadius: 999,
    background: "#f3f0ff",
    color: "#4b3fb5",
    padding: "2px 10px",
    cursor: "pointer",
    font: "inherit",
    fontSize: 12,
  },
  inputRow: { display: "flex", gap: 8, padding: 12 },
  input: {
    flex: 1,
    border: "1px solid #d0d0da",
    borderRadius: 8,
    padding: "6px 10px",
    font: "inherit",
  },
  sendButton: {
    border: "1px solid #7b6ff0",
    borderRadius: 8,
    background: "#7b6ff0",
    color: "#fff",
    padding: "6px 14px",
    cursor: "pointer",
    font: "inherit",
  },
} satisfies Record<string, CSSProperties>;

function floatStyle(
  position: "bottom-right" | "bottom-left" | "inline",
): CSSProperties {
  if (position === "inline") {
    return {};
  }
  return {
    position: "fixed",
    bottom: 16,
    zIndex: 2147483000,
    ...(position === "bottom-right" ? { right: 16 } : { left: 16 }),
  };
}

/**
 * The shipped assistant chat widget: a floating launcher that opens a chat
 * thread bound to the current page's mounted surfaces, with inline
 * confirmation cards for actions that require the user's approval.
 *
 * Defaults to the HTTP model adapter at `/api/agentface` — mount
 * `@agentface/next`'s route handler there (or set `endpoint`/`adapter`).
 * Build a custom UI instead with {@link useAgentFaceAssistant}.
 *
 * Must be rendered inside an `<AgentFaceProvider>`.
 *
 * @example
 * ```tsx
 * <AgentFaceAssistant title="Ask Acme" position="bottom-right" />
 * ```
 */
export function AgentFaceAssistant(props: AgentFaceAssistantProps): ReactNode {
  const {
    title = "Assistant",
    placeholder = "Ask the assistant to do something…",
    position = "bottom-right",
    defaultOpen = false,
    suggestions: showSuggestions = true,
    ...hookOptions
  } = props;
  const assistant = useAgentFaceAssistant(hookOptions);
  const [open, setOpen] = useState(defaultOpen);
  const [input, setInput] = useState("");
  // Live next-step recommendations: re-evaluated on runtime events and a
  // light poll, so buttons appear and change as data fills in.
  const recommendations = useAgentRecommendations();
  const messagesRef = useRef<HTMLDivElement | null>(null);

  // The input stays locked for the whole run — including while a
  // confirmation card is waiting on the user.
  const locked = assistant.busy;

  useEffect(() => {
    const container = messagesRef.current;
    if (container !== null) {
      container.scrollTop = container.scrollHeight;
    }
  }, [assistant.messages, assistant.busy, assistant.pendingConfirmation]);

  async function submit(): Promise<void> {
    const text = input.trim();
    if (text.length === 0 || assistant.busy) {
      return;
    }
    setInput("");
    await assistant.send(text);
  }

  return (
    <div style={floatStyle(position)}>
      {open ? (
        <div style={styles.panel}>
          <div style={styles.header}>
            <span>{title}</span>
            <button
              type="button"
              style={styles.headerButton}
              aria-label="Close assistant"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </div>
          <style>{`@keyframes agentface-dot { 0%, 80%, 100% { opacity: 0.25 } 40% { opacity: 1 } }`}</style>
          <div
            ref={messagesRef}
            style={styles.messages}
            data-testid="assistant-messages"
          >
            {assistant.messages.length === 0 ? (
              <p style={styles.emptyState}>
                Ask me to do something on this page.
              </p>
            ) : null}
            {assistant.messages.map((message, messageIndex) => (
              <div key={messageIndex} style={{ display: "contents" }}>
                {message.content.map((part, partIndex) => {
                  if (part.type === "text") {
                    return (
                      <p
                        key={partIndex}
                        style={
                          message.role === "user"
                            ? styles.userBubble
                            : styles.assistantBubble
                        }
                      >
                        {part.text}
                      </p>
                    );
                  }
                  if (part.type === "tool-call") {
                    return (
                      <p key={partIndex} style={styles.toolLine}>
                        → {part.toolName}
                      </p>
                    );
                  }
                  return (
                    <p key={partIndex} style={styles.toolLine}>
                      ← {part.isError === true ? "error" : "done"}
                    </p>
                  );
                })}
              </div>
            ))}
            {assistant.busy && assistant.pendingConfirmation === null ? (
              <div style={styles.workingRow} aria-label="Assistant is working">
                <span>Working</span>
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    style={{
                      display: "inline-block",
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: "#5b5878",
                      animation: "agentface-dot 1.2s infinite",
                      animationDelay: `${dot * 0.2}s`,
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>

          {assistant.pendingConfirmation !== null ? (
            <div style={styles.confirmation} data-testid="confirmation-card">
              <p style={{ fontWeight: 700, margin: 0 }}>
                Confirmation required
              </p>
              <p style={{ margin: "4px 0" }}>
                {assistant.pendingConfirmation.preview?.summary ??
                  assistant.pendingConfirmation.actionId}
              </p>
              <div>
                <button
                  type="button"
                  style={styles.confirmButton}
                  onClick={assistant.confirm}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  style={styles.declineButton}
                  onClick={assistant.decline}
                >
                  Decline
                </button>
              </div>
            </div>
          ) : null}

          {showSuggestions && recommendations.length > 0 && !locked ? (
            <div style={styles.suggestions}>
              {recommendations.map((recommendation) => (
                <button
                  key={`${recommendation.instanceId}:${recommendation.actionId}`}
                  type="button"
                  style={styles.chip}
                  data-testid="assistant-suggestion"
                  title={recommendation.reason}
                  onClick={() => void assistant.send(recommendation.instruction)}
                >
                  ✦ {recommendation.name}
                </button>
              ))}
            </div>
          ) : null}

          <div style={styles.inputRow}>
            <input
              style={{
                ...styles.input,
                ...(locked ? { opacity: 0.5, background: "#f4f3f8" } : {}),
              }}
              aria-label="Assistant instruction"
              placeholder={
                locked
                  ? assistant.pendingConfirmation !== null
                    ? "Waiting for your confirmation above…"
                    : "Working — please wait…"
                  : placeholder
              }
              value={input}
              disabled={locked}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void submit();
                }
              }}
            />
            {locked ? (
              <button
                type="button"
                style={{
                  ...styles.sendButton,
                  background: "#fff",
                  color: "#4b3fb5",
                }}
                aria-label="Stop the assistant"
                onClick={assistant.cancel}
              >
                Stop
              </button>
            ) : (
              <button
                type="button"
                style={styles.sendButton}
                onClick={() => void submit()}
              >
                Send
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          style={styles.launcher}
          aria-label="Open assistant"
          onClick={() => setOpen(true)}
        >
          {title} ✦
        </button>
      )}
    </div>
  );
}
