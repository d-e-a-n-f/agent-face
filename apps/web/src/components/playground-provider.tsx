"use client";

import { AgentFaceApp } from "@agentface/next/app";
import { standardUserPolicy } from "@agentface/policy";
import { applicationManifest } from "../../agentface.config";
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
