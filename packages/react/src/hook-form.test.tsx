import { defineAgentFace } from "@agentface/core";
import type { AgentRuntime } from "@agentface/runtime";
import { createAgentRuntime } from "@agentface/runtime";
import { render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it } from "vitest";
import { AgentFaceProvider } from "./context.js";
import { useAgentForm } from "./hook-form.js";
import { AgentSurface } from "./surface.js";

const face = defineAgentFace({
  id: "test.form",
  name: "Form host",
  description: "Hosts a form",
  version: "0.1.0",
});

interface Values {
  company: { name: string; country: string };
  contact: { email: string };
  notes: string;
}

function FormHost({ enabled = true }: { enabled?: boolean }) {
  const form = useForm<Values>({
    defaultValues: {
      company: { name: "", country: "" },
      contact: { email: "" },
      notes: "",
    },
  });
  useAgentForm({
    form,
    name: "Test form",
    description: "a test form",
    isEnabled: () => enabled,
  });
  return <span>form</span>;
}

async function mount(runtime: AgentRuntime, ui: React.ReactElement) {
  render(
    <StrictMode>
      <AgentFaceProvider runtime={runtime}>{ui}</AgentFaceProvider>
    </StrictMode>,
  );
  let instanceId = "";
  await waitFor(async () => {
    const { surfaces } = await runtime.discover();
    expect(surfaces).toHaveLength(1);
    instanceId = surfaces[0]?.instance.instanceId ?? "";
    expect(surfaces[0]?.actions.map((action) => action.id)).toContain(
      "fill-form",
    );
  });
  return instanceId;
}

describe("useAgentForm", () => {
  let runtime: AgentRuntime;

  beforeEach(() => {
    runtime = createAgentRuntime();
  });

  it("derives a state resource and a partial fill action from the form", async () => {
    const instanceId = await mount(
      runtime,
      <AgentSurface face={face}>
        <FormHost />
      </AgentSurface>,
    );

    const prepared = await runtime.prepareAction({
      instanceId,
      actionId: "fill-form",
      input: {
        company: { name: "Northshore Limited" },
        notes: "VIP client",
      },
    });
    const execution = await runtime.executeAction({
      preparationId: prepared.preparationId,
    });
    expect(execution.result).toMatchObject({
      status: "succeeded",
      result: {
        applied: ["company.name", "notes"],
        values: {
          company: { name: "Northshore Limited", country: "" },
          notes: "VIP client",
        },
      },
    });

    const read = await runtime.readResource({
      instanceId,
      resourceId: "form-state",
    });
    expect(read.value).toMatchObject({
      values: { company: { name: "Northshore Limited" } },
    });
  });

  it("drops unknown fields and rejects type mismatches", async () => {
    const instanceId = await mount(
      runtime,
      <AgentSurface face={face}>
        <FormHost />
      </AgentSurface>,
    );

    // Unknown keys are pruned silently (never reach the form).
    const prepared = await runtime.prepareAction({
      instanceId,
      actionId: "fill-form",
      input: { company: { name: "X", hacked: "yes" }, evil: true },
    });
    const execution = await runtime.executeAction({
      preparationId: prepared.preparationId,
    });
    expect(execution.result).toMatchObject({
      result: { applied: ["company.name"] },
    });

    // Type mismatches are INVALID_INPUT at prepare time.
    await expect(
      runtime.prepareAction({
        instanceId,
        actionId: "fill-form",
        input: { company: { name: 42 } },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      details: { mismatched: ["company.name"] },
    });
  });

  it("publishes a structural JSON schema for the model", async () => {
    const instanceId = await mount(
      runtime,
      <AgentSurface face={face}>
        <FormHost />
      </AgentSurface>,
    );
    const snapshot = await runtime.inspectSurface(instanceId);
    const fill = snapshot.actions.find((action) => action.id === "fill-form");
    expect(fill?.inputSchema).toMatchObject({
      type: "object",
      properties: {
        company: {
          type: "object",
          properties: { name: { type: "string" }, country: { type: "string" } },
        },
        notes: { type: "string" },
      },
    });
  });

  it("honours isEnabled as action availability", async () => {
    const instanceId = await mount(
      runtime,
      <AgentSurface face={face}>
        <FormHost enabled={false} />
      </AgentSurface>,
    );
    await expect(
      runtime.prepareAction({
        instanceId,
        actionId: "fill-form",
        input: { notes: "x" },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
