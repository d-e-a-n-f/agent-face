"use client";

import { defineAgentApplication } from "@agentface/core";
import { AgentFaceApp } from "@agentface/next/app";
import { standardUserPolicy } from "@agentface/policy";
import type { ReactNode } from "react";
import { useState } from "react";
import { createE2eMockAdapter } from "@/lib/e2e-mock-adapter";

// CI runs the deterministic e2e mock adapter; everywhere else the shipped
// widget defaults to Claude via the /api/agentface route.
const mockEnabled = process.env.NEXT_PUBLIC_AGENTFACE_MOCK === "1";

// The static application manifest: every screen, its faces, its entities.
// Drives navigation, the application-map resource, the assistant's
// app-wide context, and the DevTools coverage report.
const applicationManifest = defineAgentApplication({
  id: "agentface-playground",
  name: "AgentFace Playground",
  routes: [
    { path: "/", description: "Playground home", surfaces: [] },
    {
      path: "/examples/counter",
      description: "Counter learning example",
      surfaces: ["examples.counter"],
    },
    { path: "/portal", description: "Portal home", surfaces: [] },
    {
      path: "/portal/clients",
      description: "Client list",
      surfaces: ["portal.clients"],
      entities: ["client"],
    },
    {
      path: "/portal/clients/:clientId",
      description: "One client: profile, onboarding status, invoices",
      surfaces: ["portal.client"],
      entities: ["client"],
    },
    {
      path: "/portal/clients/:clientId/onboarding",
      description: "The client's onboarding form",
      surfaces: ["portal.onboarding"],
      entities: ["client"],
    },
    {
      path: "/portal/invoices/:invoiceId",
      description: "One invoice: add line items, discount, send",
      surfaces: ["portal.invoice"],
      entities: ["invoice"],
    },
  ],
});

/** The whole AgentFace setup is one component. */
export function PlaygroundProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [mockAdapter] = useState(() =>
    mockEnabled ? createE2eMockAdapter() : null,
  );
  return (
    <AgentFaceApp
      application={{ id: "agentface-playground", name: "AgentFace Playground" }}
      user={{ type: "user", id: "user_dean", displayName: "Dean" }}
      // The shipped production baseline: authenticated user required,
      // restricted capabilities denied outright (the invoice write-off
      // demo), confidential+ executions confirmed.
      policy={standardUserPolicy()}
      manifest={applicationManifest}
      assistant={{
        title: "Assistant",
        maxIterations: 16,
        ...(mockAdapter !== null ? { adapter: mockAdapter } : {}),
      }}
    >
      {children}
    </AgentFaceApp>
  );
}
