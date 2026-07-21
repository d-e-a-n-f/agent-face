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

  it("starts as a floating launcher and offers action suggestions when opened", async () => {
    const user = userEvent.setup();
    const { runtime } = setupRuntime();
    render(
      <AgentFaceProvider runtime={runtime}>
        <AgentFaceAssistant adapter={sendScript()} title="Ask Acme" />
      </AgentFaceProvider>,
    );
    expect(screen.queryByLabelText("Assistant instruction")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Open assistant" }));
    const chip = await screen.findByTestId("assistant-suggestion");
    expect(chip.textContent).toBe("Send invoice");
    await user.click(chip);
    expect(
      screen.getByLabelText<HTMLInputElement>("Assistant instruction").value,
    ).toBe("Send invoice");
  });
});
