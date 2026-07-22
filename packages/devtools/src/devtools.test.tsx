import type { AgentInputSchema } from "@agentface/core";
import {
  AgentFaceError,
  defineAgentAction,
  defineAgentFace,
  defineAgentResource,
} from "@agentface/core";
import { AgentFaceProvider } from "@agentface/react";
import type { AgentRuntime, AgentSurfaceRegistration } from "@agentface/runtime";
import { createAgentRuntime } from "@agentface/runtime";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { AgentFaceDevTools } from "./devtools.js";

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
});

interface Invoice {
  status: "draft" | "sent";
  total: number;
}

function setupInvoice(runtime: AgentRuntime): {
  invoice: Invoice;
  surface: AgentSurfaceRegistration;
} {
  const invoice: Invoice = { status: "draft", total: 1200 };
  const surface = runtime.registerSurface({
    face: invoiceFace,
    entity: { type: "invoice", id: "inv_9821", displayName: "Invoice #9821" },
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
      execute: () => {
        invoice.status = "sent";
        surface.bumpRevision();
        return { sent: true };
      },
    }),
  });
  return { invoice, surface };
}

function renderPanel(runtime: AgentRuntime): void {
  render(
    <StrictMode>
      <AgentFaceProvider runtime={runtime}>
        <AgentFaceDevTools defaultOpen />
      </AgentFaceProvider>
    </StrictMode>,
  );
}

describe("AgentFaceDevTools", () => {
  let runtime: AgentRuntime;

  beforeEach(() => {
    runtime = createAgentRuntime();
  });

  it("lists mounted surfaces in the tree and shows capability metadata", async () => {
    setupInvoice(runtime);
    renderPanel(runtime);

    expect(
      await screen.findByRole("button", { name: /billing\.invoice/ }),
    ).toBeDefined();
    expect(await screen.findByText("Invoice summary")).toBeDefined();
    expect(await screen.findByText("Send invoice")).toBeDefined();
    expect(await screen.findByText("confirmation: always")).toBeDefined();
    expect(
      await screen.findByText(/preconditions: invoice-is-draft/),
    ).toBeDefined();
  });

  it("reads a resource's current value on demand", async () => {
    const user = userEvent.setup();
    setupInvoice(runtime);
    renderPanel(runtime);

    await user.click(
      await screen.findByRole("button", { name: "Read Invoice summary" }),
    );
    await waitFor(() => {
      expect(screen.getByText(/"status": "draft"/)).toBeDefined();
    });
  });

  it("runs the full lifecycle: prepare, preview, confirm, execute, trace", async () => {
    const user = userEvent.setup();
    const { invoice } = setupInvoice(runtime);
    renderPanel(runtime);

    const inputEditor = await screen.findByLabelText("Action input JSON");
    await user.clear(inputEditor);
    await user.type(inputEditor, '{{"message": "here you go"}');

    await user.click(screen.getByRole("button", { name: "Prepare" }));

    // Preview and confirmation state are shown.
    await screen.findByText("Send invoice with message: here you go");
    await screen.findByText("confirmation required");

    // Execute is blocked until the exact preparation is confirmed.
    const executeButton = screen.getByRole("button", { name: "Execute" });
    expect(executeButton).toHaveProperty("disabled", true);

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Execute" }),
      ).toHaveProperty("disabled", false);
    });

    await user.click(screen.getByRole("button", { name: "Execute" }));
    await screen.findByText("succeeded");
    expect(invoice.status).toBe("sent");

    // The lifecycle is visible in the trace stream.
    const trace = runtime.getTraceEvents().map((event) => event.type);
    for (const expected of [
      "action.preparing",
      "action.prepared",
      "action.confirmation-required",
      "action.confirmed",
      "action.executing",
      "action.succeeded",
    ]) {
      expect(trace).toContain(expected);
    }
    await screen.findByText("action.succeeded");
  });

  it("surfaces validation errors from prepare", async () => {
    const user = userEvent.setup();
    setupInvoice(runtime);
    renderPanel(runtime);

    const inputEditor = await screen.findByLabelText("Action input JSON");
    await user.clear(inputEditor);
    await user.type(inputEditor, '{{"message": 5}');
    await user.click(screen.getByRole("button", { name: "Prepare" }));

    expect(await screen.findAllByText(/INVALID_INPUT/)).not.toHaveLength(0);
  });

  it("shows an empty state without mounted surfaces", async () => {
    renderPanel(runtime);
    expect(await screen.findByText("No mounted surfaces.")).toBeDefined();
    expect(
      await screen.findByText("Select a surface to inspect it."),
    ).toBeDefined();
  });

  it("filters the trace viewer by trace id", async () => {
    const user = userEvent.setup();
    setupInvoice(runtime);
    renderPanel(runtime);

    await screen.findByText("surface.registered");
    const filter = screen.getByLabelText("Filter by trace id");
    await user.type(filter, "no-such-trace");
    await waitFor(() => {
      expect(screen.queryByText("surface.registered")).toBeNull();
    });
    expect(screen.getByText("No trace events.")).toBeDefined();
  });

  it("the panel toggles open and closed", async () => {
    const user = userEvent.setup();
    setupInvoice(runtime);
    render(
      <StrictMode>
        <AgentFaceProvider runtime={runtime}>
          <AgentFaceDevTools />
        </AgentFaceProvider>
      </StrictMode>,
    );
    expect(screen.queryByText("Surfaces")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByText("Surfaces")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Surfaces")).toBeNull();
  });

  it("marks a preparation stale when the surface revision moves on", async () => {
    const user = userEvent.setup();
    const { surface } = setupInvoice(runtime);
    renderPanel(runtime);

    const inputEditor = await screen.findByLabelText("Action input JSON");
    await user.clear(inputEditor);
    await user.type(inputEditor, '{{"message": "hello"}');
    await user.click(screen.getByRole("button", { name: "Prepare" }));
    await screen.findByText("confirmation required");

    // The application state changes underneath the preparation. A structural
    // event refreshes the panel so it can compare revisions.
    surface.bumpRevision();
    await runtime.prepareAction({
      instanceId: surface.instanceId,
      actionId: "send",
      input: { message: "concurrent" },
    });

    await screen.findByText(/execution will fail with/);
  });
});
