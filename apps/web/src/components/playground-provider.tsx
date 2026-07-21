"use client";

import { AgentFaceAssistant } from "@agentface/assistant/react";
import { AgentFaceDevTools } from "@agentface/devtools";
import { createPolicyEngine, enforceActionConfirmation } from "@agentface/policy";
import { AgentFaceProvider } from "@agentface/react";
import { createAgentRuntime } from "@agentface/runtime";
import type { ReactNode } from "react";
import { useState } from "react";
import { createDemoAdapter } from "@/lib/demo-adapter";

// CI runs the deterministic demo adapter; everywhere else the shipped
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
  const [demoAdapter] = useState(() =>
    mockEnabled ? createDemoAdapter() : null,
  );
  return (
    <AgentFaceProvider
      runtime={runtime}
      application={{ id: "agentface-playground", name: "AgentFace Playground" }}
      user={{ type: "user", id: "user_dean", displayName: "Dean" }}
    >
      <div className="flex-1">{children}</div>
      <AgentFaceAssistant
        title="Assistant"
        position="bottom-left"
        {...(demoAdapter !== null ? { adapter: demoAdapter } : {})}
      />
      <AgentFaceDevTools />
    </AgentFaceProvider>
  );
}
