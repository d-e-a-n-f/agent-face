import { describe, expect, it } from "vitest";
import type { AgentRuntimeEvent, AgentTraceEvent } from "./events.js";

/**
 * Compile-time exhaustiveness: adding a new event type without extending this
 * switch fails `check-types`, which keeps DevTools renderers honest.
 */
function describeEvent(event: AgentRuntimeEvent): string {
  switch (event.type) {
    case "surface.registered":
      return `registered ${event.surface.instanceId}`;
    case "surface.unregistered":
      return `unregistered ${event.instanceId}`;
    case "resource.read":
      return `read ${event.resourceId} on ${event.instanceId}`;
    case "action.preparing":
    case "action.prepared":
    case "action.confirmation-required":
    case "action.confirmed":
    case "action.executing":
    case "action.succeeded":
      return `${event.type} ${event.actionId}`;
    case "action.failed":
      return `${event.actionId} failed: ${event.error.code}`;
    case "policy.decided":
      return `policy ${event.effect} for ${event.operation}`;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

describe("AgentRuntimeEvent", () => {
  it("is handled exhaustively", () => {
    expect(
      describeEvent({
        type: "action.failed",
        instanceId: "billing.invoice:inv_9821:01",
        actionId: "send",
        error: { code: "EXECUTION_FAILED", message: "boom" },
      }),
    ).toBe("send failed: EXECUTION_FAILED");
  });

  it("trace events add correlation data to any event", () => {
    const traceEvent: AgentTraceEvent = {
      type: "policy.decided",
      operation: "execute-action",
      effect: "confirm",
      reason: "Sending requires confirmation",
      traceId: "trace_01",
      timestamp: "2026-07-21T00:00:00.000Z",
    };
    expect(traceEvent.traceId).toBe("trace_01");
  });
});
