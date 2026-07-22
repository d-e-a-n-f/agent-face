"use client";

import { AgentFaceKnowledge } from "@agentface/react";
import type { ReactNode } from "react";
import { PORTAL_HELP } from "./help";
import { PortalStoreProvider } from "./store";

/**
 * The Portal's client shell: one shared store for every portal page (it
 * lives in the layout, so navigation keeps it) plus the app's help content
 * for the assistant to ground its answers in.
 */
export function PortalShell({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return (
    <PortalStoreProvider>
      <AgentFaceKnowledge articles={PORTAL_HELP} />
      {children}
    </PortalStoreProvider>
  );
}
