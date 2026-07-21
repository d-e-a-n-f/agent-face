import type {
  AgentModelAdapter,
  AgentModelRequest,
  AssistantContentPart,
} from "@agentface/assistant";

/**
 * TEST FIXTURE — never active outside e2e. The real widget default is the
 * LLM endpoint; this adapter exists solely so Playwright can drive the
 * assistant deterministically (ADR 0006: no real model calls in CI). It is
 * bundled only behind NEXT_PUBLIC_AGENTFACE_MOCK=1, which only the
 * Playwright web server sets.
 *
 * A stateless deterministic adapter for CI (enabled via
 * NEXT_PUBLIC_AGENTFACE_MOCK=1): pattern-matches on the conversation instead
 * of keeping script state, so it survives multiple sends and both
 * confirm/decline outcomes. Drives the MISSION Phase-6 acceptance
 * instruction against the invoice example.
 */
export function createE2eMockAdapter(): AgentModelAdapter {
  return {
    complete(request: AgentModelRequest) {
      const findTool = (suffix: string) =>
        request.tools.find((tool) => tool.name.endsWith(suffix))?.name;
      const lastMessage = request.messages[request.messages.length - 1];
      const lastResults = (lastMessage?.content ?? []).filter(
        (
          part,
        ): part is Extract<AssistantContentPart, { type: "tool-result" }> =>
          part.type === "tool-result",
      );

      const sendResult = lastResults.find((part) =>
        part.toolName.endsWith("__send"),
      );
      if (sendResult !== undefined) {
        const declined =
          typeof sendResult.result === "object" &&
          sendResult.result !== null &&
          (sendResult.result as { declined?: boolean }).declined === true;
        return Promise.resolve({
          text: declined
            ? "Understood — the invoice was not sent."
            : "All done — the invoice was sent after your confirmation.",
          toolCalls: [],
          stopReason: "end-turn" as const,
        });
      }

      if (lastResults.some((part) => part.toolName.endsWith("__add-line-item"))) {
        const send = findTool("__send");
        if (send !== undefined) {
          return Promise.resolve({
            text: "Line item added. Preparing the invoice for sending — please confirm.",
            toolCalls: [{ toolCallId: "demo_send", toolName: send, input: {} }],
            stopReason: "tool-use" as const,
          });
        }
      }

      const addLineItem = findTool("__add-line-item");
      if (addLineItem !== undefined) {
        return Promise.resolve({
          text: "Adding the consulting line item.",
          toolCalls: [
            {
              toolCallId: "demo_add",
              toolName: addLineItem,
              input: { description: "Consulting", quantity: 1, unitPrice: 100 },
            },
          ],
          stopReason: "tool-use" as const,
        });
      }

      return Promise.resolve({
        text: "The demo adapter drives the invoice example — open /examples/invoice.",
        toolCalls: [],
        stopReason: "end-turn" as const,
      });
    },
  };
}
