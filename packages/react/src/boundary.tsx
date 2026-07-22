"use client";

import type { AgentSensitivity } from "@agentface/core";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";

/** Inherited policy metadata provided by {@link AgentBoundary}. */
export interface AgentBoundaryPolicy {
  /** Default sensitivity applied to descendant registrations that declare none. */
  readonly maximumSensitivity?: AgentSensitivity;
}

const BoundaryContext = createContext<AgentBoundaryPolicy>({});

/** Props for {@link AgentBoundary}. */
export interface AgentBoundaryProps {
  readonly policy: AgentBoundaryPolicy;
  readonly children: ReactNode;
}

/**
 * Provides inherited policy metadata to descendant resource and action
 * registrations. Descendants that declare no sensitivity inherit
 * `maximumSensitivity` as their classification.
 *
 * This is metadata inheritance, not a security sandbox — enforcement happens
 * in the policy engine.
 */
export function AgentBoundary(props: AgentBoundaryProps): ReactNode {
  const outer = useContext(BoundaryContext);
  const value = useMemo<AgentBoundaryPolicy>(
    () => ({ ...outer, ...props.policy }),
    [outer, props.policy],
  );
  return (
    <BoundaryContext.Provider value={value}>
      {props.children}
    </BoundaryContext.Provider>
  );
}

/** The nearest boundary's inherited policy metadata (empty outside any boundary). */
export function useAgentBoundary(): AgentBoundaryPolicy {
  return useContext(BoundaryContext);
}
