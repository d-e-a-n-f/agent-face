// @vitest-environment jsdom
import type { AgentInputSchema } from "@agentface/core";
import {
  AgentFaceError,
  defineAgentAction,
  defineAgentFace,
} from "@agentface/core";
import { AgentFaceProvider } from "@agentface/react";
import type { AgentRuntime } from "@agentface/runtime";
import { createAgentRuntime } from "@agentface/runtime";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createMockModelAdapter } from "./mock.js";
import { AgentFaceAssistant } from "./react.js";
import type { AgentModelRequest } from "./types.js";

const emptySchema: AgentInputSchema<Record<string, never>> = {
  parse(input: unknown): Record<string, never> {
    if (typeof input !== "object" || input === null) {
      throw new AgentFaceError({ code: "INVALID_INPUT", message: "no" });
    }
    return input as Record<string, never>;
  },
};

function setupRuntime(): { runtime: AgentRuntime; state: { sent: boolean } } {
  const runtime = createAgentRuntime();
  const state = { sent: false };
  const surface = runtime.registerSurface({
    face: defineAgentFace({
      id: "billing.invoice",
      name: "Invoice",
      description: "An invoice",
      version: "0.1.0",
    }),
  });
  runtime.registerAction(surface.instanceId, {
    definition: defineAgentAction({
      id: "send",
      name: "Send invoice",
      description: "Send it",
      input: emptySchema,
      confirmation: "always",
      recommend: {
        when: () => !state.sent,
        reason: "The invoice is ready to send",
        instruction: "Send the invoice to the customer",
      },
      preview: () => ({ summary: "Send INV-1 to the customer" }),
      execute: () => {
        state.sent = true;
        return { sent: true };
      },
    }),
  });
  return { runtime, state };
}

function sendScript() {
  return createMockModelAdapter([
    (request: AgentModelRequest) => ({
      toolCalls: [
        {
          toolCallId: "c1",
          toolName:
            request.tools.find((tool) => tool.name.endsWith("__send"))?.name ??
            "missing",
          input: {},
        },
      ],
      stopReason: "tool-use" as const,
    }),
    { text: "Sent.", toolCalls: [], stopReason: "end-turn" as const },
  ]);
}

describe("AgentFaceAssistant widget", () => {
  it("runs an instruction with an inline confirmation card", async () => {
    const user = userEvent.setup();
    const { runtime, state } = setupRuntime();
    render(
      <AgentFaceProvider runtime={runtime}>
        <AgentFaceAssistant adapter={sendScript()} defaultOpen />
      </AgentFaceProvider>,
    );

    await user.type(
      screen.getByLabelText("Assistant instruction"),
      "Send the invoice",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    const card = await screen.findByTestId("confirmation-card");
    expect(card.textContent).toContain("Send INV-1 to the customer");
    expect(state.sent).toBe(false);

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(state.sent).toBe(true);
    });
    await screen.findByText("Sent.");
  });

  it("locks the input and send button while the run awaits confirmation", async () => {
    const user = userEvent.setup();
    const { runtime } = setupRuntime();
    render(
      <AgentFaceProvider runtime={runtime}>
        <AgentFaceAssistant adapter={sendScript()} defaultOpen />
      </AgentFaceProvider>,
    );
    await user.type(screen.getByLabelText("Assistant instruction"), "Send it");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByTestId("confirmation-card");
    const input = screen.getByLabelText<HTMLInputElement>(
      "Assistant instruction",
    );
    expect(input.disabled).toBe(true);
    expect(input.placeholder).toContain("Waiting for your confirmation");
    // While locked, sending is replaced by a Stop control.
    expect(
      screen.queryByRole("button", { name: "Send" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Stop the assistant" }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(
        screen.getByLabelText<HTMLInputElement>("Assistant instruction")
          .disabled,
      ).toBe(false);
    });
  });

  it("declining leaves the action unexecuted", async () => {
    const user = userEvent.setup();
    const { runtime, state } = setupRuntime();
    render(
      <AgentFaceProvider runtime={runtime}>
        <AgentFaceAssistant adapter={sendScript()} defaultOpen />
      </AgentFaceProvider>,
    );
    await user.type(screen.getByLabelText("Assistant instruction"), "Send it");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(await screen.findByRole("button", { name: "Decline" }));
    await waitFor(() => {
      expect(screen.queryByTestId("confirmation-card")).toBeNull();
    });
    expect(state.sent).toBe(false);
  });

  it("recommendation buttons run the instruction and re-evaluate as state changes", async () => {
    const user = userEvent.setup();
    const { runtime, state } = setupRuntime();
    render(
      <AgentFaceProvider runtime={runtime}>
        <AgentFaceAssistant adapter={sendScript()} title="Ask Acme" />
      </AgentFaceProvider>,
    );
    expect(screen.queryByLabelText("Assistant instruction")).toBeNull();
    // The launcher's accessible name is its visible text: "<title> ✦".
    await user.click(screen.getByRole("button", { name: "Ask Acme ✦" }));

    // The app declared send as the recommended next step.
    const chip = await screen.findByTestId("assistant-suggestion");
    expect(chip.textContent).toContain("Send invoice");
    expect(chip.title).toBe("The invoice is ready to send");

    // One tap runs it through the assistant — full confirmation flow.
    await user.click(chip);
    await user.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(state.sent).toBe(true);
    });

    // Recommendations re-evaluate: sent, so no longer recommended.
    await waitFor(() => {
      expect(screen.queryByTestId("assistant-suggestion")).toBeNull();
    });
  });

  it("renders streaming text while a turn is in flight and usage after", async () => {
    window.sessionStorage.clear();
    const { runtime } = setupRuntime();
    let releaseTurn: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    const user = userEvent.setup();
    render(
      <AgentFaceProvider runtime={runtime}>
        <AgentFaceAssistant
          defaultOpen
          adapter={{
            complete: async () => {
              throw new Error("unused");
            },
            completeStream: async (_request, onDelta) => {
              onDelta("Strea");
              onDelta("ming reply");
              await gate;
              return {
                text: "Streaming reply",
                toolCalls: [],
                stopReason: "end-turn" as const,
                usage: { inputTokens: 1500, outputTokens: 42 },
              };
            },
          }}
        />
      </AgentFaceProvider>,
    );
    await user.type(
      screen.getByLabelText("Assistant instruction"),
      "stream it{Enter}",
    );
    await waitFor(() => {
      expect(screen.getByTestId("assistant-streaming").textContent).toBe(
        "Streaming reply",
      );
    });
    releaseTurn?.();
    await waitFor(() => {
      expect(screen.queryByTestId("assistant-streaming")).toBeNull();
    });
    // Usage renders in the header once reported: 1.5k in / 42 out.
    expect(screen.getByTestId("assistant-usage").textContent).toContain("1.5k");
    expect(screen.getByTestId("assistant-usage").textContent).toContain("42");
    window.sessionStorage.clear();
  });

  it("persists the conversation and restores it on remount", async () => {
    window.sessionStorage.clear();
    const { runtime } = setupRuntime();
    const adapter = {
      complete: async () => ({
        text: "Saved answer",
        toolCalls: [],
        stopReason: "end-turn" as const,
      }),
    };
    const user = userEvent.setup();
    const view = render(
      <AgentFaceProvider runtime={runtime}>
        <AgentFaceAssistant defaultOpen adapter={adapter} />
      </AgentFaceProvider>,
    );
    await user.type(
      screen.getByLabelText("Assistant instruction"),
      "remember me{Enter}",
    );
    await screen.findByText("Saved answer");
    view.unmount();

    // A fresh mount (same tab/session) restores the thread.
    render(
      <AgentFaceProvider runtime={runtime}>
        <AgentFaceAssistant defaultOpen adapter={adapter} />
      </AgentFaceProvider>,
    );
    await screen.findByText("Saved answer");
    expect(screen.getByText("remember me")).toBeTruthy();

    // Clearing the conversation clears the storage too.
    await user.click(screen.getByRole("button", { name: "Clear conversation" }));
    await waitFor(() => {
      expect(screen.queryByText("Saved answer")).toBeNull();
    });
    expect(
      window.sessionStorage.getItem("agentface-chat:app"),
    ).toBeNull();
  });
});
