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
          { path: "/", description: "Examples index" },
          { path: "/examples/counter", description: "Counter example" },
          {
            path: "/examples/customer-table",
            description: "Customer table with filters and selection",
          },
          { path: "/examples/invoice", description: "Invoice editor" },
          {
            path: "/examples/onboarding",
            description: "Client onboarding form (agent fills, human owns)",
          },
          {
            path: "/examples/product-publication",
            description: "Share class creation, approval, and publication",
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
