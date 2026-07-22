import { defineAgentApplication } from "@agentface/core";
import type { AgentDiscoveryResult } from "@agentface/runtime";
import { describe, expect, it } from "vitest";
import { computeCoverage } from "./coverage.js";

const manifest = defineAgentApplication({
  id: "demo",
  routes: [
    {
      path: "/invoices/:invoiceId",
      description: "One invoice",
      surfaces: ["billing.invoice"],
    },
    { path: "/empty", description: "No surfaces here", surfaces: [] },
  ],
});

function discovery(
  overrides: Partial<{
    faceId: string;
    sensitivity: "confidential" | undefined;
    hasPreview: boolean;
    confirmationPolicy: "never" | "always";
  }> = {},
): AgentDiscoveryResult {
  return {
    surfaces: [
      {
        instance: {
          instanceId: "i1",
          face: {
            id: overrides.faceId ?? "billing.invoice",
            description: "Invoice",
          },
          childInstanceIds: [],
          mountedAt: "2026-07-22T00:00:00.000Z",
          revision: 0,
        },
        resources: [],
        actions: [
          {
            id: "send",
            name: "Send",
            description: "Send it",
            ...(overrides.sensitivity !== undefined
              ? { sensitivity: overrides.sensitivity }
              : {}),
            confirmationPolicy: overrides.confirmationPolicy ?? "always",
            hasPreview: overrides.hasPreview ?? true,
            preconditions: [],
          },
        ],
      },
    ],
  };
}

describe("computeCoverage", () => {
  it("flags routes without surfaces and scores accordingly", () => {
    const { score, findings } = computeCoverage(manifest, discovery());
    expect(findings.some((finding) => finding.level === "fail")).toBe(true);
    expect(score).toBeLessThan(100);
  });

  it("warns on mounted faces missing from the manifest", () => {
    const { findings } = computeCoverage(
      manifest,
      discovery({ faceId: "rogue.surface" }),
    );
    expect(
      findings.some(
        (finding) =>
          finding.level === "warn" && finding.text.includes("rogue.surface"),
      ),
    ).toBe(true);
  });

  it("warns on sensitive actions without previews or confirmation", () => {
    const { findings } = computeCoverage(
      manifest,
      discovery({
        sensitivity: "confidential",
        hasPreview: false,
        confirmationPolicy: "never",
      }),
    );
    expect(
      findings.filter((finding) => finding.level === "warn").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("scores 100 when everything lines up", () => {
    const clean = defineAgentApplication({
      id: "demo",
      routes: [
        {
          path: "/invoices/:invoiceId",
          description: "One invoice",
          surfaces: ["billing.invoice"],
        },
      ],
    });
    const { score } = computeCoverage(clean, discovery());
    expect(score).toBe(100);
  });
});
