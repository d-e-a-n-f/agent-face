"use client";

import { useAgentRuntime } from "@agentface/react";
import type { PreparedAgentAction } from "@agentface/runtime";
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
  const runtime = useAgentRuntime();
  const [messages, setMessages] = useState<readonly AssistantMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PreparedAgentAction | null>(null);
  const decisionRef = useRef<((decision: ConfirmationDecision) => void) | null>(
    null,
  );

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
    width: 360,
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
    maxHeight: 320,
    overflowY: "auto",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  userText: { fontWeight: 600 },
  assistantText: { color: "#3a3852" },
  toolLine: { color: "#807d99", fontSize: 11 },
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

interface Suggestion {
  readonly label: string;
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
  const runtime = useAgentRuntime();
  const assistant = useAgentFaceAssistant(hookOptions);
  const [open, setOpen] = useState(defaultOpen);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<readonly Suggestion[]>([]);

  useEffect(() => {
    if (!open || !showSuggestions) {
      return;
    }
    let cancelled = false;
    void runtime.discover().then(({ surfaces }) => {
      if (cancelled) {
        return;
      }
      setSuggestions(
        surfaces
          .flatMap((surface) => surface.actions)
          .slice(0, 3)
          .map((action) => ({ label: action.name })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [runtime, open, showSuggestions, assistant.busy]);

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
          <div style={styles.messages} data-testid="assistant-messages">
            {assistant.messages.map((message, messageIndex) => (
              <div key={messageIndex}>
                {message.content.map((part, partIndex) => {
                  if (part.type === "text") {
                    return (
                      <p
                        key={partIndex}
                        style={
                          message.role === "user"
                            ? styles.userText
                            : styles.assistantText
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
                      ← {part.isError === true ? "error" : "ok"}
                    </p>
                  );
                })}
              </div>
            ))}
            {assistant.busy ? <p style={styles.toolLine}>Working…</p> : null}
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

          {showSuggestions && suggestions.length > 0 ? (
            <div style={styles.suggestions}>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.label}
                  type="button"
                  style={styles.chip}
                  data-testid="assistant-suggestion"
                  onClick={() => setInput(suggestion.label)}
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          ) : null}

          <div style={styles.inputRow}>
            <input
              style={styles.input}
              aria-label="Assistant instruction"
              placeholder={placeholder}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void submit();
                }
              }}
            />
            <button
              type="button"
              style={{
                ...styles.sendButton,
                ...(assistant.busy ? { opacity: 0.5 } : {}),
              }}
              disabled={assistant.busy}
              onClick={() => void submit()}
            >
              Send
            </button>
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
