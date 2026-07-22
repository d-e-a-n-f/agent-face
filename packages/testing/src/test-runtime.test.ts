import type { AgentInputSchema } from "@agentface/core";
import {
  AgentFaceError,
  defineAgentAction,
  defineAgentFace,
} from "@agentface/core";
import type { AgentRuntime, AgentSurfaceRegistration } from "@agentface/runtime";
import { describe, expect, it } from "vitest";
import {
  createTestAgentRuntime,
  createTestPrincipal,
  executeTestAction,
  prepareTestAction,
  registerTestSurface,
} from "./test-runtime.js";

interface SendInput {
  readonly message?: string;
}

const sendInputSchema: AgentInputSchema<SendInput> = {
  parse(input: unknown): SendInput {
    if (typeof input !== "object" || input === null) {
      throw new AgentFaceError({
        code: "INVALID_INPUT",
        message: "Expected an object",
      });
    }
    return input as SendInput;
  },
};

const invoiceFace = defineAgentFace({
  id: "billing.invoice",
  name: "Invoice",
  description: "Manage an invoice",
  version: "0.1.0",
});

function registerInvoiceSurface(
  runtime: AgentRuntime,
  state: { status: "draft" | "sent" },
): AgentSurfaceRegistration {
  const surface = registerTestSurface(runtime, { face: invoiceFace });
  runtime.registerAction(surface.instanceId, {
    definition: defineAgentAction({
      id: "send",
      name: "Send invoice",
      description: "Send the invoice",
      input: sendInputSchema,
      confirmation: "always",
      preconditions: [
        {
          id: "invoice-is-draft",
          description: "The invoice must still be a draft",
          check: () => state.status === "draft",
        },
      ],
      execute: () => {
        state.status = "sent";
        return { sent: true };
      },
    }),
  });
  return surface;
}

describe("createTestAgentRuntime", () => {
  it("requires confirmation before sending an invoice", async () => {
    const runtime = createTestAgentRuntime();
    const surface = registerInvoiceSurface(runtime, { status: "draft" });

    const prepared = await prepareTestAction(runtime, {
      instanceId: surface.instanceId,
      actionId: "send",
      input: { message: "Please find the invoice attached." },
    });

    expect(prepared.confirmationRequired).toBe(true);
  });

  it("cannot send an already-sent invoice", async () => {
    const runtime = createTestAgentRuntime();
    const surface = registerInvoiceSurface(runtime, { status: "sent" });

    await expect(
      runtime.prepareAction({
        instanceId: surface.instanceId,
        actionId: "send",
        input: {},
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("executeTestAction auto-confirms and executes", async () => {
    const runtime = createTestAgentRuntime();
    const state = { status: "draft" as const };
    const surface = registerInvoiceSurface(runtime, state);

    const result = await executeTestAction(runtime, {
      instanceId: surface.instanceId,
      actionId: "send",
      input: {},
    });

    expect(result.result).toEqual({
      status: "succeeded",
      result: { sent: true },
    });
    expect(state.status).toBe("sent");
  });

  it("executeTestAction with autoConfirm: false surfaces CONFIRMATION_REQUIRED", async () => {
    const runtime = createTestAgentRuntime();
    const surface = registerInvoiceSurface(runtime, { status: "draft" });

    await expect(
      executeTestAction(
        runtime,
        { instanceId: surface.instanceId, actionId: "send", input: {} },
        { autoConfirm: false },
      ),
    ).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
  });

  it("the deterministic clock drives expiry", async () => {
    const runtime = createTestAgentRuntime({ preparationTtlMs: 1000 });
    const surface = registerInvoiceSurface(runtime, { status: "draft" });
    const prepared = await prepareTestAction(runtime, {
      instanceId: surface.instanceId,
      actionId: "send",
      input: {},
    });
    runtime.advanceTime(1001);
    await expect(
      runtime.confirmAction({ preparationId: prepared.preparationId }),
    ).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
  });

  it("a deny-all policy blocks preparation", async () => {
    const runtime = createTestAgentRuntime({ policy: "deny-all" });
    const surface = registerInvoiceSurface(runtime, { status: "draft" });
    await expect(
      runtime.prepareAction({
        instanceId: surface.instanceId,
        actionId: "send",
        input: {},
      }),
    ).rejects.toMatchObject({ code: "POLICY_DENIED" });
  });

  it("createTestPrincipal links agent and user with a delegation", () => {
    const principals = createTestPrincipal();
    expect(principals.delegation).toMatchObject({
      userId: principals.user?.id,
      agentId: principals.agent?.id,
    });
    expect(createTestPrincipal({ agentless: true }).agent).toBeUndefined();
  });
});
