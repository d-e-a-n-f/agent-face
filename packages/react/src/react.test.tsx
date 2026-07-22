import type { AgentInputSchema } from "@agentface/core";
import { AgentFaceError, defineAgentFace } from "@agentface/core";
import type { AgentRuntime } from "@agentface/runtime";
import { createAgentRuntime } from "@agentface/runtime";
import { act, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBoundary } from "./boundary.js";
import { AgentFaceProvider, useAgentRuntime } from "./context.js";
import { AgentSurface, useAgentSurface } from "./surface.js";
import { useAgentAction } from "./use-agent-action.js";
import { useAgentResource } from "./use-agent-resource.js";

const counterFace = defineAgentFace({
  id: "examples.counter",
  name: "Counter",
  description: "A simple counter",
  version: "0.1.0",
});

const linesFace = defineAgentFace({
  id: "examples.counter.lines",
  name: "Counter lines",
  description: "Nested child surface",
  version: "0.1.0",
});

interface IncrementInput {
  readonly amount: number;
}

const incrementSchema: AgentInputSchema<IncrementInput> = {
  parse(input: unknown): IncrementInput {
    if (
      typeof input !== "object" ||
      input === null ||
      typeof (input as { amount?: unknown }).amount !== "number"
    ) {
      throw new AgentFaceError({
        code: "INVALID_INPUT",
        message: "Expected { amount: number }",
      });
    }
    return input as IncrementInput;
  },
};

function Counter(): React.JSX.Element {
  const [count, setCount] = useState(0);
  const surface = useAgentSurface();

  useAgentResource({
    id: "current-value",
    name: "Current value",
    description: "The counter's current value",
    value: count,
    revision: count,
  });

  useAgentAction({
    id: "increment",
    name: "Increment",
    description: "Increase the counter",
    input: incrementSchema,
    execute: (input) => {
      setCount((current) => current + input.amount);
      surface?.bumpRevision();
      return { previous: count, incrementedBy: input.amount };
    },
  });

  return (
    <button type="button" onClick={() => setCount((current) => current + 1)}>
      count: {count}
    </button>
  );
}

function App({ runtime }: { runtime: AgentRuntime }): React.JSX.Element {
  return (
    <AgentFaceProvider runtime={runtime}>
      <AgentSurface face={counterFace} entity={{ type: "counter", id: "c1" }}>
        <Counter />
      </AgentSurface>
    </AgentFaceProvider>
  );
}

async function mountedSurfaces(runtime: AgentRuntime) {
  const { surfaces } = await runtime.discover();
  return surfaces;
}

describe("@agentface/react", () => {
  let runtime: AgentRuntime;

  beforeEach(() => {
    runtime = createAgentRuntime();
  });

  describe("Strict Mode safety", () => {
    it("mount/unmount/remount yields exactly one surface, resource, and action", async () => {
      render(
        <StrictMode>
          <App runtime={runtime} />
        </StrictMode>,
      );
      await waitFor(async () => {
        const surfaces = await mountedSurfaces(runtime);
        expect(surfaces).toHaveLength(1);
        expect(surfaces[0]?.resources).toHaveLength(1);
        expect(surfaces[0]?.actions).toHaveLength(1);
      });
      // Strict Mode ran the full cycle: registrations were created twice…
      const registered = runtime
        .getTraceEvents()
        .filter((event) => event.type === "surface.registered");
      expect(registered.length).toBeGreaterThanOrEqual(2);
      // …but every extra one was cleaned up, not leaked.
      const unregistered = runtime
        .getTraceEvents()
        .filter((event) => event.type === "surface.unregistered");
      expect(registered.length - unregistered.length).toBe(1);
    });

    it("unmount removes the surface and all capabilities", async () => {
      const view = render(
        <StrictMode>
          <App runtime={runtime} />
        </StrictMode>,
      );
      await waitFor(async () => {
        expect(await mountedSurfaces(runtime)).toHaveLength(1);
      });
      view.unmount();
      expect(await mountedSurfaces(runtime)).toHaveLength(0);
    });
  });

  describe("live state", () => {
    it("rerenders update the value agents read, without re-registration", async () => {
      const user = (await import("@testing-library/user-event")).default.setup();
      render(
        <StrictMode>
          <App runtime={runtime} />
        </StrictMode>,
      );
      let instanceId = "";
      await waitFor(async () => {
        const surfaces = await mountedSurfaces(runtime);
        expect(surfaces).toHaveLength(1);
        instanceId = surfaces[0]?.instance.instanceId ?? "";
      });

      await expect(
        runtime.readResource({ instanceId, resourceId: "current-value" }),
      ).resolves.toMatchObject({ value: 0, revision: 0 });

      await user.click(screen.getByRole("button"));
      await user.click(screen.getByRole("button"));

      await expect(
        runtime.readResource({ instanceId, resourceId: "current-value" }),
      ).resolves.toMatchObject({ value: 2, revision: 2 });

      // The same registration served both reads — no churn.
      expect(await mountedSurfaces(runtime)).toHaveLength(1);
    });

    it("actions executed after rerenders use current callbacks and state", async () => {
      const user = (await import("@testing-library/user-event")).default.setup();
      render(
        <StrictMode>
          <App runtime={runtime} />
        </StrictMode>,
      );
      let instanceId = "";
      await waitFor(async () => {
        const surfaces = await mountedSurfaces(runtime);
        instanceId = surfaces[0]?.instance.instanceId ?? "";
        expect(instanceId).not.toBe("");
      });

      // Move local state along before the agent acts.
      await user.click(screen.getByRole("button"));
      await user.click(screen.getByRole("button"));
      await user.click(screen.getByRole("button"));

      const prepared = await runtime.prepareAction({
        instanceId,
        actionId: "increment",
        input: { amount: 10 },
      });
      let execution;
      await act(async () => {
        execution = await runtime.executeAction({
          preparationId: prepared.preparationId,
        });
      });
      // The closure saw the current count (3), not the mount-time count (0).
      expect(execution).toMatchObject({
        result: {
          status: "succeeded",
          result: { previous: 3, incrementedBy: 10 },
        },
      });
      await waitFor(async () => {
        await expect(
          runtime.readResource({ instanceId, resourceId: "current-value" }),
        ).resolves.toMatchObject({ value: 13 });
      });
    });
  });

  describe("surface graph", () => {
    it("nested surfaces register parent/child relationships", async () => {
      render(
        <StrictMode>
          <AgentFaceProvider runtime={runtime}>
            <AgentSurface face={counterFace}>
              <AgentSurface face={linesFace}>
                <span>nested</span>
              </AgentSurface>
            </AgentSurface>
          </AgentFaceProvider>
        </StrictMode>,
      );
      await waitFor(async () => {
        const surfaces = await mountedSurfaces(runtime);
        expect(surfaces).toHaveLength(2);
        const parent = surfaces.find(
          (surface) => surface.instance.face.id === "examples.counter",
        );
        const child = surfaces.find(
          (surface) => surface.instance.face.id === "examples.counter.lines",
        );
        expect(child?.instance.parentInstanceId).toBe(
          parent?.instance.instanceId,
        );
        expect(parent?.instance.childInstanceIds).toContain(
          child?.instance.instanceId,
        );
      });
    });

    it("entity identity changes remount the surface as a fresh instance", async () => {
      function Harness({ entityId }: { entityId: string }): React.JSX.Element {
        return (
          <AgentFaceProvider runtime={runtime}>
            <AgentSurface
              face={counterFace}
              entity={{ type: "counter", id: entityId }}
            >
              <span>counter</span>
            </AgentSurface>
          </AgentFaceProvider>
        );
      }
      const view = render(
        <StrictMode>
          <Harness entityId="c1" />
        </StrictMode>,
      );
      let firstInstanceId = "";
      await waitFor(async () => {
        const surfaces = await mountedSurfaces(runtime);
        expect(surfaces[0]?.instance.entity?.id).toBe("c1");
        firstInstanceId = surfaces[0]?.instance.instanceId ?? "";
      });
      view.rerender(
        <StrictMode>
          <Harness entityId="c2" />
        </StrictMode>,
      );
      await waitFor(async () => {
        const surfaces = await mountedSurfaces(runtime);
        expect(surfaces).toHaveLength(1);
        expect(surfaces[0]?.instance.entity?.id).toBe("c2");
        // A different entity is a different surface instance — never the
        // same registration rebound in place.
        expect(surfaces[0]?.instance.instanceId).not.toBe(firstInstanceId);
      });
    });

    it("a preparation for entity A can never execute after rebinding to entity B", async () => {
      const operated: string[] = [];
      function Harness({ entityId }: { entityId: string }): React.JSX.Element {
        return (
          <AgentFaceProvider runtime={runtime}>
            <AgentSurface
              face={counterFace}
              entity={{ type: "invoice", id: entityId }}
            >
              <ArchiveButton entityId={entityId} />
            </AgentSurface>
          </AgentFaceProvider>
        );
      }
      function ArchiveButton({
        entityId,
      }: {
        entityId: string;
      }): React.JSX.Element {
        useAgentAction({
          id: "archive",
          name: "Archive",
          description: "Archive this invoice",
          confirmation: "always",
          execute: () => {
            // Latest-render closure: after rerender this targets entity B.
            operated.push(entityId);
            return { archived: entityId };
          },
        });
        return <span>{entityId}</span>;
      }

      const view = render(
        <StrictMode>
          <Harness entityId="inv_A" />
        </StrictMode>,
      );
      let instanceId = "";
      await waitFor(async () => {
        const surfaces = await mountedSurfaces(runtime);
        expect(surfaces).toHaveLength(1);
        instanceId = surfaces[0]?.instance.instanceId ?? "";
        expect(surfaces[0]?.actions).toHaveLength(1);
      });
      const prepared = await runtime.prepareAction({
        instanceId,
        actionId: "archive",
        input: {},
      });

      // The same mounted component rebinds to a different invoice before
      // the user confirms.
      view.rerender(
        <StrictMode>
          <Harness entityId="inv_B" />
        </StrictMode>,
      );
      await waitFor(async () => {
        const surfaces = await mountedSurfaces(runtime);
        expect(surfaces[0]?.instance.entity?.id).toBe("inv_B");
      });

      await expect(
        runtime.confirmAction({ preparationId: prepared.preparationId }),
      ).rejects.toMatchObject({ code: "ACTION_NOT_FOUND" });
      await expect(
        runtime.executeAction({ preparationId: prepared.preparationId }),
      ).rejects.toMatchObject({ code: "ACTION_NOT_FOUND" });
      expect(operated).toEqual([]);
    });
  });

  describe("boundaries", () => {
    it("registrations inherit the boundary sensitivity when they declare none", async () => {
      function Bounded(): React.JSX.Element {
        useAgentResource({
          id: "details",
          name: "Details",
          description: "Customer details",
          value: { name: "Acme" },
        });
        return <span>bounded</span>;
      }
      render(
        <StrictMode>
          <AgentFaceProvider runtime={runtime}>
            <AgentSurface face={counterFace}>
              <AgentBoundary policy={{ maximumSensitivity: "internal" }}>
                <Bounded />
              </AgentBoundary>
            </AgentSurface>
          </AgentFaceProvider>
        </StrictMode>,
      );
      await waitFor(async () => {
        const surfaces = await mountedSurfaces(runtime);
        expect(surfaces[0]?.resources[0]).toMatchObject({
          id: "details",
          sensitivity: "internal",
        });
      });
    });
  });

  describe("misuse errors", () => {
    it.each([
      [
        "useAgentRuntime outside provider",
        function Misused(): React.JSX.Element {
          useAgentRuntime();
          return <span />;
        },
        /within an <AgentFaceProvider>/,
      ],
      [
        "useAgentSurface outside a surface",
        function Misused(): React.JSX.Element {
          useAgentSurface();
          return <span />;
        },
        /within an <AgentSurface>/,
      ],
    ] as const)("%s throws a descriptive error", (_label, Misused, message) => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        expect(() => render(<Misused />)).toThrowError(message);
      } finally {
        spy.mockRestore();
      }
    });

    it("useAgentResource outside a surface throws a descriptive error", () => {
      function Misused(): React.JSX.Element {
        useAgentResource({
          id: "x",
          name: "X",
          description: "X",
          value: 1,
        });
        return <span />;
      }
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        expect(() =>
          render(
            <AgentFaceProvider runtime={runtime}>
              <Misused />
            </AgentFaceProvider>,
          ),
        ).toThrowError(/within an <AgentSurface>/);
      } finally {
        spy.mockRestore();
      }
    });
  });
});
