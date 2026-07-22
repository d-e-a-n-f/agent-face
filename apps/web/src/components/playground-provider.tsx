"use client";

import { AgentFaceApp } from "@agentface/next/app";
import {
  createPolicyEngine,
  enforceActionConfirmation,
  enforceSensitivity,
} from "@agentface/policy";
import type { ReactNode } from "react";
import { useState } from "react";
import { createE2eMockAdapter } from "@/lib/e2e-mock-adapter";

// CI runs the deterministic e2e mock adapter; everywhere else the shipped
// widget defaults to Claude via the /api/agentface route.
const mockEnabled = process.env.NEXT_PUBLIC_AGENTFACE_MOCK === "1";

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
      policy={createPolicyEngine([
        // confidential+ executions require confirmation; restricted ones are
        // denied outright (see the invoice write-off demo).
        enforceActionConfirmation(),
        enforceSensitivity({ execute: "confidential" }),
      ])}
      routes={[
        { path: "/", description: "Playground home" },
        { path: "/examples/counter", description: "Counter learning example" },
        { path: "/portal", description: "Portal home" },
        { path: "/portal/clients", description: "Client list" },
        {
          path: "/portal/clients/:clientId",
          description: "One client: profile, onboarding status, invoices",
        },
        {
          path: "/portal/clients/:clientId/onboarding",
          description: "The client's onboarding form",
        },
        {
          path: "/portal/invoices/:invoiceId",
          description: "One invoice: add line items, discount, send",
        },
      ]}
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
