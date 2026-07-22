// @vitest-environment jsdom
import { defineAgentFace } from "@agentface/core";
import { AgentSurface, useAgentResource } from "@agentface/react";
import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getMountedSurfaces, renderWithAgentFace } from "./react.js";

const face = defineAgentFace({
  id: "test.widget",
  name: "Widget",
  description: "A test widget",
  version: "0.1.0",
});

function Widget(): React.JSX.Element {
  useAgentResource({
    id: "state",
    name: "Widget state",
    description: "The widget's state",
    value: { ready: true },
  });
  return <span>widget</span>;
}

describe("renderWithAgentFace", () => {
  it("renders under a provider with a deterministic runtime, in Strict Mode", async () => {
    const { runtime, getByText } = renderWithAgentFace(
      <AgentSurface face={face}>
        <Widget />
      </AgentSurface>,
    );
    expect(getByText("widget")).toBeDefined();
    await waitFor(async () => {
      const surfaces = await getMountedSurfaces(runtime);
      expect(surfaces).toHaveLength(1);
      expect(surfaces[0]?.resources).toHaveLength(1);
    });
  });

  it("accepts a caller-provided runtime", async () => {
    const { runtime } = renderWithAgentFace(
      <AgentSurface face={face}>
        <Widget />
      </AgentSurface>,
    );
    const again = renderWithAgentFace(<span>other</span>, { runtime });
    expect(again.runtime).toBe(runtime);
  });
});
