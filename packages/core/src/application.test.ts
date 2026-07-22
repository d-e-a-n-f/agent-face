import { describe, expect, it } from "vitest";
import { defineAgentApplication } from "./application.js";
import { AgentFaceError } from "./errors.js";

function expectInvalid(fn: () => unknown): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AgentFaceError);
  expect((caught as AgentFaceError).code).toBe("INVALID_INPUT");
}

describe("defineAgentApplication", () => {
  const valid = {
    id: "acme-portal",
    routes: [
      {
        path: "/clients/:clientId",
        description: "One client",
        surfaces: ["crm.client"],
        entities: ["client"],
      },
      { path: "/", description: "Home", surfaces: [] },
    ],
  };

  it("freezes a valid manifest", () => {
    const manifest = defineAgentApplication(valid);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.routes[0])).toBe(true);
    expect(manifest.routes).toHaveLength(2);
  });

  it.each([
    ["blank id", { ...valid, id: " " }],
    [
      "bad path",
      { ...valid, routes: [{ path: "clients", description: "x", surfaces: [] }] },
    ],
    [
      "blank description",
      { ...valid, routes: [{ path: "/a", description: " ", surfaces: [] }] },
    ],
    [
      "duplicate route",
      {
        ...valid,
        routes: [
          { path: "/a", description: "x", surfaces: [] },
          { path: "/a", description: "y", surfaces: [] },
        ],
      },
    ],
  ])("rejects %s", (_label, manifest) => {
    expectInvalid(() => defineAgentApplication(manifest));
  });

  it("accepts param segments and dotted static segments", () => {
    expect(
      defineAgentApplication({
        id: "x",
        routes: [
          {
            path: "/files/:fileId/versions/:versionId",
            description: "File version",
            surfaces: [],
          },
        ],
      }).routes,
    ).toHaveLength(1);
  });
});
