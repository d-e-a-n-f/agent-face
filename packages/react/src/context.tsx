"use client";

import type { AgentPrincipal, UserPrincipal } from "@agentface/core";
import type { AgentRuntime } from "@agentface/runtime";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";

/** Identifies the host application to agents. */
export interface AgentFaceApplicationInfo {
  readonly id: string;
  readonly name: string;
}

/** The value provided by {@link AgentFaceProvider}. */
export interface AgentFaceContextValue {
  readonly runtime: AgentRuntime;
  readonly application?: AgentFaceApplicationInfo;
  readonly user?: UserPrincipal;
  readonly agent?: AgentPrincipal;
}

const AgentFaceContext = createContext<AgentFaceContextValue | undefined>(
  undefined,
);

/** Props for {@link AgentFaceProvider}. */
export interface AgentFaceProviderProps {
  readonly runtime: AgentRuntime;
  readonly application?: AgentFaceApplicationInfo;
  /** The human user of the application. */
  readonly user?: UserPrincipal;
  /** The agent operating the application, when one is active. */
  readonly agent?: AgentPrincipal;
  readonly children: ReactNode;
}

/**
 * Hosts the AgentFace runtime for a React tree. Place once near the root;
 * all AgentFace hooks and components must be descendants.
 *
 * @example
 * ```tsx
 * <AgentFaceProvider
 *   runtime={runtime}
 *   application={{ id: "agentface-playground", name: "AgentFace Playground" }}
 *   user={currentUser}
 * >
 *   <App />
 * </AgentFaceProvider>
 * ```
 */
export function AgentFaceProvider(props: AgentFaceProviderProps): ReactNode {
  const outer = useContext(AgentFaceContext);
  if (process.env.NODE_ENV !== "production" && outer !== undefined) {
    console.warn(
      "AgentFaceProvider is nested inside another AgentFaceProvider; the inner runtime will shadow the outer one.",
    );
  }
  const { runtime, application, user, agent, children } = props;
  const value = useMemo<AgentFaceContextValue>(
    () => ({
      runtime,
      ...(application !== undefined ? { application } : {}),
      ...(user !== undefined ? { user } : {}),
      ...(agent !== undefined ? { agent } : {}),
    }),
    [runtime, application, user, agent],
  );
  return (
    <AgentFaceContext.Provider value={value}>
      {children}
    </AgentFaceContext.Provider>
  );
}

/**
 * The full AgentFace context: runtime, application identity, and principals.
 *
 * @throws when used outside an {@link AgentFaceProvider}.
 */
export function useAgentContext(): AgentFaceContextValue {
  const value = useContext(AgentFaceContext);
  if (value === undefined) {
    throw new Error(
      "useAgentContext must be used within an <AgentFaceProvider>.",
    );
  }
  return value;
}

/**
 * The AgentFace runtime hosted by the nearest provider.
 *
 * @throws when used outside an {@link AgentFaceProvider}.
 */
export function useAgentRuntime(): AgentRuntime {
  return useAgentContext().runtime;
}
