"use client";

import { AgentFaceDevTools } from "@agentface/devtools";
import { createPolicyEngine, enforceActionConfirmation } from "@agentface/policy";
import { AgentFaceProvider } from "@agentface/react";
import { createAgentRuntime } from "@agentface/runtime";
import type { ReactNode } from "react";
import { useState } from "react";

/**
 * Hosts one browser-local AgentFace runtime for the playground, with the
 * DevTools panel docked below the page content.
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
  return (
    <AgentFaceProvider
      runtime={runtime}
      application={{ id: "agentface-playground", name: "AgentFace Playground" }}
      user={{ type: "user", id: "user_dean", displayName: "Dean" }}
    >
      <div className="flex-1">{children}</div>
      <AgentFaceDevTools />
    </AgentFaceProvider>
  );
}
