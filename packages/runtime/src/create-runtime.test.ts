import type { AgentInputSchema, AgentTraceEvent } from "@agentface/core";
import {
  AgentFaceError,
  defineAgentAction,
  defineAgentFace,
  defineAgentResource,
} from "@agentface/core";
import { createPolicyEngine, denyAll } from "@agentface/policy";
import { beforeEach, describe, expect, it } from "vitest";
import { createAgentRuntime } from "./create-runtime.js";
import type { AgentRuntime, AgentSurfaceRegistration } from "./types.js";

interface SendInput {
  readonly message: string;
}

const sendInputSchema: AgentInputSchema<SendInput> = {
  parse(input: unknown): SendInput {
    if (
      typeof input !== "object" ||
      input === null ||
      typeof (input as { message?: unknown }).message !== "string"
    ) {
      throw new AgentFaceError({
        code: "INVALID_INPUT",
        message: "Expected { message: string }",
      });
    }
    return input as SendInput;
  },
  toJSONSchema: () => ({
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
  }),
};

const invoiceFace = defineAgentFace({
  id: "billing.invoice",
  name: "Invoice",
  description: "View, edit and send a customer invoice",
  version: "0.1.0",
  tags: ["billing"],
});

interface Invoice {
  status: "draft" | "sent";
  total: number;
  sentMessage?: string;
}

/** A deterministic invoice fixture wired into a runtime. */
function setupInvoice(runtime: AgentRuntime): {
  invoice: Invoice;
  surface: AgentSurfaceRegistration;
} {
  const invoice: Invoice = { status: "draft", total: 1200 };
  const surface = runtime.registerSurface({
    face: invoiceFace,
    entity: { type: "invoice", id: "inv_9821" },
  });

  runtime.registerResource(surface.instanceId, {
    definition: defineAgentResource<Invoice>({
      id: "summary",
      name: "Invoice summary",
      description: "The current invoice totals and status",
      serialize: (value) => ({ status: value.status, total: value.total }),
    }),
    getValue: () => invoice,
  });

  runtime.registerAction(surface.instanceId, {
    definition: defineAgentAction({
      id: "send",
      name: "Send invoice",
      description: "Send the completed invoice to the customer",
      input: sendInputSchema,
      confirmation: "always",
      preconditions: [
        {
          id: "invoice-is-draft",
          description: "The invoice must still be a draft",
          check: () => invoice.status === "draft",
        },
      ],
      preview: (input) => ({
        summary: `Send invoice with message: ${input.message}`,
        changes: [{ path: "status", from: "draft", to: "sent" }],
      }),
      execute: (input) => {
        invoice.status = "sent";
        invoice.sentMessage = input.message;
        surface.bumpRevision();
        return { sent: true };
      },
    }),
    isAvailable: () => invoice.status === "draft",
  });

  return { invoice, surface };
}

async function expectCode(
  promise: Promise<unknown>,
  code: AgentFaceError["code"],
): Promise<AgentFaceError> {
  let caught: unknown;
  try {
    await promise;
  } catch (thrown) {
    caught = thrown;
  }
  expect(caught).toBeInstanceOf(AgentFaceError);
  expect((caught as AgentFaceError).code).toBe(code);
  return caught as AgentFaceError;
}

describe("createAgentRuntime", () => {
  let nowMs: number;
  let runtime: AgentRuntime;

  beforeEach(() => {
    nowMs = Date.parse("2026-07-21T12:00:00.000Z");
    runtime = createAgentRuntime({ now: () => new Date(nowMs) });
  });

  describe("full lifecycle", () => {
    it("registers, discovers, reads, prepares, confirms, executes, and traces", async () => {
      const { invoice, surface } = setupInvoice(runtime);

      const discovery = await runtime.discover({ text: "invoice" });
      expect(discovery.surfaces).toHaveLength(1);
      expect(discovery.surfaces[0]?.actions.map((action) => action.id)).toEqual(
        ["send"],
      );

      const read = await runtime.readResource({
        instanceId: surface.instanceId,
        resourceId: "summary",
      });
      expect(read.value).toEqual({ status: "draft", total: 1200 });

      const prepared = await runtime.prepareAction({
        instanceId: surface.instanceId,
        actionId: "send",
        input: { message: "Please find the invoice attached." },
      });
      expect(prepared.confirmationRequired).toBe(true);
      expect(prepared.preview).toEqual({
        summary: "Send invoice with message: Please find the invoice attached.",
        changes: [{ path: "status", from: "draft", to: "sent" }],
      });

      // Execution before confirmation must be refused.
      await expectCode(
        runtime.executeAction({ preparationId: prepared.preparationId }),
        "CONFIRMATION_REQUIRED",
      );

      await runtime.confirmAction({ preparationId: prepared.preparationId });
      const execution = await runtime.executeAction({
        preparationId: prepared.preparationId,
      });
      expect(execution.result).toEqual({
        status: "succeeded",
        result: { sent: true },
      });
      expect(invoice.status).toBe("sent");

      const reread = await runtime.readResource({
        instanceId: surface.instanceId,
        resourceId: "summary",
      });
      expect(reread.value).toEqual({ status: "sent", total: 1200 });

      const eventTypes = runtime
        .getTraceEvents()
        .map((event: AgentTraceEvent) => event.type);
      expect(eventTypes).toEqual([
        "surface.registered",
        "policy.decided", // discover: surface
        "policy.decided", // discover: read-resource filter
        "policy.decided", // discover: inspect-action filter
        "policy.decided", // read
        "resource.read",
        "action.preparing",
        "policy.decided", // inspect-action
        "policy.decided", // execute-action
        "policy.decided", // preview-action
        "action.prepared",
        "action.confirmation-required",
        "action.failed", // execute attempt before confirmation
        "action.confirmed",
        "policy.decided", // execute-action re-evaluated at execution
        "action.executing",
        "action.succeeded",
        "policy.decided", // re-read
        "resource.read",
      ]);
    });

    it("a prepared action executes exactly once", async () => {
      const { surface } = setupInvoice(runtime);
      const prepared = await runtime.prepareAction({
        instanceId: surface.instanceId,
        actionId: "send",
        input: { message: "once" },
      });
      await runtime.confirmAction({ preparationId: prepared.preparationId });
      await runtime.executeAction({ preparationId: prepared.preparationId });
      await expectCode(
        runtime.executeAction({ preparationId: prepared.preparationId }),
        "ACTION_NOT_FOUND",
      );
    });
  });

  describe("failure paths", () => {
    it("prepare on an unknown surface throws SURFACE_NOT_FOUND", async () => {
      await expectCode(
        runtime.prepareAction({
          instanceId: "nope",
          actionId: "send",
          input: {},
        }),
        "SURFACE_NOT_FOUND",
      );
    });

    it("prepare on an unknown action throws ACTION_NOT_FOUND", async () => {
      const { surface } = setupInvoice(runtime);
      await expectCode(
        runtime.prepareAction({
          instanceId: surface.instanceId,
          actionId: "missing",
          input: {},
        }),
        "ACTION_NOT_FOUND",
      );
    });

    it("invalid input throws INVALID_INPUT", async () => {
      const { surface } = setupInvoice(runtime);
      await expectCode(
        runtime.prepareAction({
          instanceId: surface.instanceId,
          actionId: "send",
          input: { message: 42 },
        }),
        "INVALID_INPUT",
      );
    });

    it("an unavailable action throws PRECONDITION_FAILED with kind availability", async () => {
      const { invoice, surface } = setupInvoice(runtime);
      invoice.status = "sent";
      const failure = await expectCode(
        runtime.prepareAction({
          instanceId: surface.instanceId,
          actionId: "send",
          input: { message: "hi" },
        }),
        "PRECONDITION_FAILED",
      );
      expect(failure.details).toEqual({ kind: "availability" });
    });

    it("a failing precondition identifies itself", async () => {
      const { invoice, surface } = setupInvoice(runtime);
      // Available but precondition fails: force divergence via a fresh action.
      runtime.registerAction(surface.instanceId, {
        definition: defineAgentAction({
          id: "archive",
          name: "Archive invoice",
          description: "Archive a sent invoice",
          input: sendInputSchema,
          preconditions: [
            {
              id: "invoice-is-sent",
              description: "The invoice must already be sent",
              check: () => invoice.status === "sent",
            },
          ],
          execute: () => ({ archived: true }),
        }),
      });
      const failure = await expectCode(
        runtime.prepareAction({
          instanceId: surface.instanceId,
          actionId: "archive",
          input: { message: "x" },
        }),
        "PRECONDITION_FAILED",
      );
      expect(failure.details).toEqual({ preconditionId: "invoice-is-sent" });
    });

    it("prepare with a mismatched expectedRevision throws STALE_STATE", async () => {
      const { surface } = setupInvoice(runtime);
      surface.bumpRevision();
      await expectCode(
        runtime.prepareAction({
          instanceId: surface.instanceId,
          actionId: "send",
          input: { message: "hi" },
          expectedRevision: 0,
        }),
        "STALE_STATE",
      );
    });

    it("revision drift between prepare and execute throws STALE_STATE", async () => {
      const { surface } = setupInvoice(runtime);
      const prepared = await runtime.prepareAction({
        instanceId: surface.instanceId,
        actionId: "send",
        input: { message: "hi" },
      });
      await runtime.confirmAction({ preparationId: prepared.preparationId });
      surface.bumpRevision(); // the invoice changed underneath the preparation
      await expectCode(
        runtime.executeAction({ preparationId: prepared.preparationId }),
        "STALE_STATE",
      );
    });

    it("an expired preparation is rejected at confirmation", async () => {
      const { surface } = setupInvoice(runtime);
      const prepared = await runtime.prepareAction({
        instanceId: surface.instanceId,
        actionId: "send",
        input: { message: "hi" },
      });
      nowMs += 5 * 60_000 + 1;
      const failure = await expectCode(
        runtime.confirmAction({ preparationId: prepared.preparationId }),
        "CONFIRMATION_REQUIRED",
      );
      expect(failure.details).toEqual({ expired: true });
    });

    it("an execute closure that throws yields a failed result and trace, not a throw", async () => {
      const { surface } = setupInvoice(runtime);
      runtime.registerAction(surface.instanceId, {
        definition: defineAgentAction({
          id: "explode",
          name: "Explode",
          description: "Always fails",
          input: sendInputSchema,
          execute: () => {
            throw new Error("downstream unavailable");
          },
        }),
      });
      const prepared = await runtime.prepareAction({
        instanceId: surface.instanceId,
        actionId: "explode",
        input: { message: "x" },
      });
      const execution = await runtime.executeAction({
        preparationId: prepared.preparationId,
      });
      expect(execution.result).toEqual({
        status: "failed",
        error: {
          code: "EXECUTION_FAILED",
          message: "downstream unavailable",
        },
      });
      expect(
        runtime
          .getTraceEvents()
          .some((event: AgentTraceEvent) => event.type === "action.failed"),
      ).toBe(true);
    });

    it("reading an unknown resource throws RESOURCE_NOT_FOUND", async () => {
      const { surface } = setupInvoice(runtime);
      await expectCode(
        runtime.readResource({
          instanceId: surface.instanceId,
          resourceId: "missing",
        }),
        "RESOURCE_NOT_FOUND",
      );
    });
  });

  describe("policy integration", () => {
    it("a deny policy blocks resource reads with POLICY_DENIED", async () => {
      const denied = createAgentRuntime({
        policy: createPolicyEngine([denyAll("locked down")]),
        now: () => new Date(nowMs),
      });
      const { surface } = setupInvoice(denied);
      const failure = await expectCode(
        denied.readResource({
          instanceId: surface.instanceId,
          resourceId: "summary",
        }),
        "POLICY_DENIED",
      );
      expect(failure.message).toBe("locked down");
    });

    it("a deny policy blocks preparation and hides discovery", async () => {
      const denied = createAgentRuntime({
        policy: createPolicyEngine([denyAll()]),
        now: () => new Date(nowMs),
      });
      const { surface } = setupInvoice(denied);
      await expect(denied.discover()).resolves.toEqual({ surfaces: [] });
      await expectCode(
        denied.prepareAction({
          instanceId: surface.instanceId,
          actionId: "send",
          input: { message: "hi" },
        }),
        "POLICY_DENIED",
      );
    });

    it("a confirm policy escalates an action with no definition rule", async () => {
      const confirming = createAgentRuntime({
        policy: createPolicyEngine([
          {
            id: "confirm-executes",
            evaluate: (request) =>
              request.operation === "execute-action"
                ? { effect: "confirm", reason: "Policy requires confirmation" }
                : undefined,
          },
        ]),
        now: () => new Date(nowMs),
      });
      const { surface } = setupInvoice(confirming);
      confirming.registerAction(surface.instanceId, {
        definition: defineAgentAction({
          id: "touch",
          name: "Touch",
          description: "A harmless action with no confirmation rule",
          input: sendInputSchema,
          execute: () => ({ ok: true }),
        }),
      });
      const prepared = await confirming.prepareAction({
        instanceId: surface.instanceId,
        actionId: "touch",
        input: { message: "x" },
      });
      expect(prepared.confirmationRequired).toBe(true);
      expect(prepared.confirmationReason).toBe("Policy requires confirmation");
    });
  });

  describe("registry behaviour", () => {
    it("unregistering a surface removes its capabilities and preparations", async () => {
      const { surface } = setupInvoice(runtime);
      const prepared = await runtime.prepareAction({
        instanceId: surface.instanceId,
        actionId: "send",
        input: { message: "hi" },
      });
      surface.unregister();
      await expectCode(
        runtime.readResource({
          instanceId: surface.instanceId,
          resourceId: "summary",
        }),
        "SURFACE_NOT_FOUND",
      );
      await expectCode(
        runtime.executeAction({ preparationId: prepared.preparationId }),
        "ACTION_NOT_FOUND",
      );
      await expect(runtime.discover()).resolves.toEqual({ surfaces: [] });
    });

    it("duplicate capability registration throws INVALID_INPUT", () => {
      const { surface } = setupInvoice(runtime);
      expect(() =>
        runtime.registerResource(surface.instanceId, {
          definition: defineAgentResource({
            id: "summary",
            name: "Duplicate",
            description: "Duplicate summary",
          }),
          getValue: () => null,
        }),
      ).toThrowError(AgentFaceError);
    });

    it("multiple instances of the same face and entity coexist", async () => {
      setupInvoice(runtime);
      setupInvoice(runtime);
      const discovery = await runtime.discover();
      expect(discovery.surfaces).toHaveLength(2);
      const ids = discovery.surfaces.map(
        (discovered) => discovered.instance.instanceId,
      );
      expect(new Set(ids).size).toBe(2);
    });

    it("nested surfaces build the parent/child graph and unregister cleanly", () => {
      const parent = runtime.registerSurface({ face: invoiceFace });
      const child = runtime.registerSurface({
        face: defineAgentFace({
          id: "billing.invoice.lines",
          name: "Invoice lines",
          description: "Line items of the invoice",
          version: "0.1.0",
        }),
        parentInstanceId: parent.instanceId,
      });
      const registered = runtime
        .getTraceEvents()
        .filter((event) => event.type === "surface.registered");
      expect(registered).toHaveLength(2);
      child.unregister();
      parent.unregister();
      expect(
        runtime
          .getTraceEvents()
          .filter((event) => event.type === "surface.unregistered"),
      ).toHaveLength(2);
    });

    it("capability update swaps live closures without re-registration", async () => {
      const { surface } = setupInvoice(runtime);
      let counter = 0;
      const registration = runtime.registerResource(surface.instanceId, {
        definition: defineAgentResource<number>({
          id: "counter",
          name: "Counter",
          description: "A live counter",
        }),
        getValue: () => counter,
      });
      counter = 5;
      await expect(
        runtime.readResource({
          instanceId: surface.instanceId,
          resourceId: "counter",
        }),
      ).resolves.toMatchObject({ value: 5 });
      registration.update({ getValue: () => 99 });
      await expect(
        runtime.readResource({
          instanceId: surface.instanceId,
          resourceId: "counter",
        }),
      ).resolves.toMatchObject({ value: 99 });
    });
  });

  describe("recommendations", () => {
    it("evaluates recommend closures against live state, in priority order", () => {
      const { invoice, surface } = setupInvoice(runtime);
      runtime.registerAction(surface.instanceId, {
        definition: defineAgentAction({
          id: "remind",
          name: "Send reminder",
          description: "Remind the customer",
          input: sendInputSchema,
          recommend: {
            when: () => invoice.status === "sent",
            reason: "The invoice was sent but not paid",
            instruction: () => `Send a reminder about the ${invoice.status} invoice`,
            priority: 5,
          },
          execute: () => ({ reminded: true }),
        }),
      });
      runtime.registerAction(surface.instanceId, {
        definition: defineAgentAction({
          id: "archive",
          name: "Archive",
          description: "Archive the invoice",
          input: sendInputSchema,
          recommend: { when: () => invoice.status === "sent" },
          execute: () => ({ archived: true }),
        }),
      });

      // Draft: nothing recommends yet.
      expect(runtime.getRecommendedActions()).toEqual([]);

      invoice.status = "sent";
      const recommended = runtime.getRecommendedActions();
      expect(recommended).toHaveLength(2);
      expect(recommended[0]).toMatchObject({
        actionId: "remind",
        name: "Send reminder",
        reason: "The invoice was sent but not paid",
        instruction: "Send a reminder about the sent invoice",
        priority: 5,
      });
      // Default instruction falls back to the action name; default priority 0.
      expect(recommended[1]).toMatchObject({
        actionId: "archive",
        instruction: "Archive",
        priority: 0,
      });
    });

    it("unavailable actions are never recommended, and throwing closures mean not-recommended", () => {
      const { surface } = setupInvoice(runtime);
      runtime.registerAction(surface.instanceId, {
        definition: defineAgentAction({
          id: "broken",
          name: "Broken",
          description: "Recommend closure throws",
          input: sendInputSchema,
          recommend: {
            when: () => {
              throw new Error("boom");
            },
          },
          execute: () => ({}),
        }),
      });
      runtime.registerAction(surface.instanceId, {
        definition: defineAgentAction({
          id: "hidden",
          name: "Hidden",
          description: "Recommended but unavailable",
          input: sendInputSchema,
          recommend: { when: () => true },
          execute: () => ({}),
        }),
        isAvailable: () => false,
      });
      expect(runtime.getRecommendedActions()).toEqual([]);
    });
  });

  describe("inspection and subscription", () => {
    it("inspectSurface reports metadata, availability, and policy decisions", async () => {
      const { invoice, surface } = setupInvoice(runtime);
      invoice.status = "sent";
      const snapshot = await runtime.inspectSurface(surface.instanceId);
      expect(snapshot.resources[0]).toMatchObject({
        id: "summary",
        readDecision: { effect: "allow" },
      });
      expect(snapshot.actions[0]).toMatchObject({
        id: "send",
        available: false,
        confirmationPolicy: "always",
        preconditions: [
          {
            id: "invoice-is-draft",
            description: "The invoice must still be a draft",
          },
        ],
      });
      expect(snapshot.actions[0]?.inputSchema).toMatchObject({
        type: "object",
      });
    });

    it("subscribers receive stamped events and can unsubscribe", () => {
      const seen: AgentTraceEvent[] = [];
      const unsubscribe = runtime.subscribe((event) => seen.push(event));
      const { surface } = setupInvoice(runtime);
      expect(seen[0]).toMatchObject({
        type: "surface.registered",
        timestamp: "2026-07-21T12:00:00.000Z",
      });
      unsubscribe();
      surface.unregister();
      expect(
        seen.filter((event) => event.type === "surface.unregistered"),
      ).toHaveLength(0);
    });
  });

  describe("hardening", () => {
    it("changing the entity identity invalidates outstanding preparations", async () => {
      const { surface } = setupInvoice(runtime);
      const prepared = await runtime.prepareAction({
        instanceId: surface.instanceId,
        actionId: "send",
        input: { message: "for entity A" },
      });
      await runtime.confirmAction({ preparationId: prepared.preparationId });

      // The surface rebinds to a different invoice before execution.
      surface.setEntity({ type: "invoice", id: "inv_OTHER" });

      await expectCode(
        runtime.executeAction({ preparationId: prepared.preparationId }),
        "ACTION_NOT_FOUND",
      );
      expect(
        runtime
          .getTraceEvents()
          .filter((event) => event.type === "surface.entity-changed"),
      ).toHaveLength(1);
    });

    it("a displayName-only entity update does not invalidate preparations", async () => {
      const { surface } = setupInvoice(runtime);
      const prepared = await runtime.prepareAction({
        instanceId: surface.instanceId,
        actionId: "send",
        input: { message: "still valid" },
      });
      await runtime.confirmAction({ preparationId: prepared.preparationId });
      surface.setEntity({
        type: "invoice",
        id: "inv_9821",
        displayName: "Invoice #9821",
      });
      const execution = await runtime.executeAction({
        preparationId: prepared.preparationId,
      });
      expect(execution.result.status).toBe("succeeded");
    });

    it("a changed principal context between prepare and execute is rejected", async () => {
      const { surface } = setupInvoice(runtime);
      const prepared = await runtime.prepareAction({
        instanceId: surface.instanceId,
        actionId: "send",
        input: { message: "as dean" },
        principals: { user: { type: "user", id: "user_dean" } },
      });
      await runtime.confirmAction({
        preparationId: prepared.preparationId,
        principals: { user: { type: "user", id: "user_dean" } },
      });
      await expectCode(
        runtime.executeAction({
          preparationId: prepared.preparationId,
          principals: { user: { type: "user", id: "user_other" } },
        }),
        "PRINCIPAL_CHANGED",
      );
    });

    it("execute policy is re-evaluated at execution time", async () => {
      let denyNow = false;
      const flippingRuntime = createAgentRuntime({
        now: () => new Date(nowMs),
        policy: {
          evaluate: (request) =>
            Promise.resolve(
              request.operation === "execute-action" && denyNow
                ? { effect: "deny" as const, reason: "Revoked after prepare" }
                : { effect: "allow" as const },
            ),
        },
      });
      const { surface } = setupInvoice(flippingRuntime);
      const prepared = await flippingRuntime.prepareAction({
        instanceId: surface.instanceId,
        actionId: "send",
        input: { message: "authorised then revoked" },
      });
      await flippingRuntime.confirmAction({
        preparationId: prepared.preparationId,
      });
      denyNow = true;
      await expectCode(
        flippingRuntime.executeAction({
          preparationId: prepared.preparationId,
        }),
        "POLICY_DENIED",
      );
    });

    it("discovery omits capabilities the principal may not inspect or read", async () => {
      const filteringRuntime = createAgentRuntime({
        policy: {
          evaluate: (request) =>
            Promise.resolve(
              request.operation === "inspect-action" &&
                request.actionId === "send"
                ? { effect: "deny" as const, reason: "Hidden" }
                : { effect: "allow" as const },
            ),
        },
      });
      setupInvoice(filteringRuntime);
      const discovery = await filteringRuntime.discover();
      expect(discovery.surfaces).toHaveLength(1);
      expect(discovery.surfaces[0]?.actions).toHaveLength(0);
      expect(discovery.surfaces[0]?.resources).toHaveLength(1);
    });

    it("a preview-action deny withholds the preview without blocking the operation", async () => {
      const previewDenyingRuntime = createAgentRuntime({
        policy: {
          evaluate: (request) =>
            Promise.resolve(
              request.operation === "preview-action"
                ? { effect: "deny" as const, reason: "Preview withheld" }
                : { effect: "allow" as const },
            ),
        },
      });
      const { surface } = setupInvoice(previewDenyingRuntime);
      const prepared = await previewDenyingRuntime.prepareAction({
        instanceId: surface.instanceId,
        actionId: "send",
        input: { message: "no preview" },
      });
      expect(prepared.preview).toBeUndefined();
      expect(prepared.confirmationRequired).toBe(true);
    });

    it("throwing availability/precondition/preview closures produce stable codes", async () => {
      const { surface } = setupInvoice(runtime);
      const boom = (): never => {
        throw new Error("boom");
      };
      runtime.registerAction(surface.instanceId, {
        definition: defineAgentAction({
          id: "availability-throws",
          description: "Availability closure throws",
          execute: () => ({ ok: true }),
        }),
        isAvailable: boom,
      });
      await expectCode(
        runtime.prepareAction({
          instanceId: surface.instanceId,
          actionId: "availability-throws",
          input: {},
        }),
        "AVAILABILITY_CHECK_FAILED",
      );

      runtime.registerAction(surface.instanceId, {
        definition: defineAgentAction({
          id: "precondition-throws",
          description: "Precondition closure throws",
          preconditions: [
            { id: "explodes", description: "Explodes", check: boom },
          ],
          execute: () => ({ ok: true }),
        }),
      });
      await expectCode(
        runtime.prepareAction({
          instanceId: surface.instanceId,
          actionId: "precondition-throws",
          input: {},
        }),
        "PRECONDITION_CHECK_FAILED",
      );

      runtime.registerAction(surface.instanceId, {
        definition: defineAgentAction({
          id: "preview-throws",
          description: "Preview closure throws",
          preview: boom,
          execute: () => ({ ok: true }),
        }),
      });
      await expectCode(
        runtime.prepareAction({
          instanceId: surface.instanceId,
          actionId: "preview-throws",
          input: {},
        }),
        "PREVIEW_FAILED",
      );
    });

    it("a throwing or non-JSON resource getter yields RESOURCE_READ_FAILED", async () => {
      const { surface } = setupInvoice(runtime);
      runtime.registerResource(surface.instanceId, {
        definition: defineAgentResource({
          id: "throws",
          description: "Getter throws",
        }),
        getValue: () => {
          throw new Error("read boom");
        },
      });
      await expectCode(
        runtime.readResource({
          instanceId: surface.instanceId,
          resourceId: "throws",
        }),
        "RESOURCE_READ_FAILED",
      );

      runtime.registerResource(surface.instanceId, {
        definition: defineAgentResource<Date>({
          id: "unsafe",
          description: "Not JSON-serialisable",
          // Bypasses serialize on purpose to hit the runtime check.
          serialize: (value) => value as unknown as { readonly [k: string]: never },
        }),
        getValue: () => new Date(nowMs),
      });
      const failure = await expectCode(
        runtime.readResource({
          instanceId: surface.instanceId,
          resourceId: "unsafe",
        }),
        "RESOURCE_READ_FAILED",
      );
      expect(failure.message).toContain("not JSON-serialisable");
    });

    it("a non-JSON action result becomes a failed EXECUTION_FAILED outcome", async () => {
      const { surface } = setupInvoice(runtime);
      runtime.registerAction(surface.instanceId, {
        definition: defineAgentAction({
          id: "returns-a-date",
          description: "Returns a class instance",
          execute: () => new Date(nowMs) as unknown as { readonly [k: string]: never },
        }),
      });
      const prepared = await runtime.prepareAction({
        instanceId: surface.instanceId,
        actionId: "returns-a-date",
        input: {},
      });
      const execution = await runtime.executeAction({
        preparationId: prepared.preparationId,
      });
      expect(execution.result.status).toBe("failed");
      if (execution.result.status === "failed") {
        expect(execution.result.error.code).toBe("EXECUTION_FAILED");
        expect(execution.result.error.message).toContain(
          "not JSON-serialisable",
        );
      }
    });

    it("update() swaps the recommendation closure too", () => {
      const { surface } = setupInvoice(runtime);
      let recommendNow = false;
      const registration = runtime.registerAction(surface.instanceId, {
        definition: defineAgentAction({
          id: "step",
          description: "A recommendable step",
          recommend: { when: () => false },
          execute: () => ({ ok: true }),
        }),
      });
      registration.update({
        definition: defineAgentAction({
          id: "step",
          description: "A recommendable step",
          recommend: { when: () => recommendNow },
          execute: () => ({ ok: true }),
        }),
      });
      recommendNow = true;
      expect(
        runtime
          .getRecommendedActions()
          .some((recommendation) => recommendation.actionId === "step"),
      ).toBe(true);
    });
  });
});
