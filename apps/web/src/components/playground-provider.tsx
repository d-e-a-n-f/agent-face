"use client";

import { AgentFaceAssistant } from "@agentface/assistant/react";
import { AgentFaceDevTools } from "@agentface/devtools";
import { createPolicyEngine, enforceActionConfirmation } from "@agentface/policy";
import { AgentFaceProvider } from "@agentface/react";
import { createAgentRuntime } from "@agentface/runtime";
import type { ReactNode } from "react";
import { useState } from "react";
import { createE2eMockAdapter } from "@/lib/e2e-mock-adapter";
import { AgentFaceNavigation } from "@agentface/next/navigation";

// CI runs the deterministic e2e mock adapter; everywhere else the shipped
// widget defaults to Claude via the /api/agentface route.
const mockEnabled = process.env.NEXT_PUBLIC_AGENTFACE_MOCK === "1";

/**
 * Hosts one browser-local AgentFace runtime for the playground, with the
 * assistant widget floating bottom-right and DevTools docked below.
 */
export function PlaygroundProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [runtime] = useState(() =>
    createAgentRuntime({
      policy: createPolicyEngine([enforceActionConfirmation()]),
      principals: {
        user: { type: "user", id: "user_dean", displayName: "Dean" },
      },
    }),
  );
  const [mockAdapter] = useState(() =>
    mockEnabled ? createE2eMockAdapter() : null,
  );
  return (
    <AgentFaceProvider
      runtime={runtime}
      application={{ id: "agentface-playground", name: "AgentFace Playground" }}
      user={{ type: "user", id: "user_dean", displayName: "Dean" }}
    >
      <AgentFaceNavigation
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
          {
            path: "/portal/products",
            description: "Share classes: create, validate, approve, publish",
          },
        ]}
      />
      <div className="flex-1">{children}</div>
      <AgentFaceAssistant
        title="Assistant"
        maxIterations={16}
        {...(mockAdapter !== null ? { adapter: mockAdapter } : {})}
      />
      {/* Right clearance keeps the DevTools toggle out from under the
          floating assistant launcher. */}
      <div className="pr-40">
        <AgentFaceDevTools />
      </div>
    </AgentFaceProvider>
  );
}
