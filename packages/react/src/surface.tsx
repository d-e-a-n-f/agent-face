"use client";

import type { AgentEntityReference, AgentFaceDefinition } from "@agentface/core";
import type { AgentSurfaceRegistration } from "@agentface/runtime";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAgentRuntime } from "./context.js";

/** The mounted surface available to descendants of {@link AgentSurface}. */
export interface AgentSurfaceHandle {
  readonly instanceId: string;
  /** Bumps the instance revision. Call after state mutations so stale prepared actions are rejected. */
  readonly bumpRevision: () => number;
}

/**
 * `undefined` — no `AgentSurface` ancestor (a usage error for surface hooks).
 * `null` — inside an `AgentSurface` whose registration effect has not
 * committed yet (a normal transient state).
 */
const SurfaceContext = createContext<AgentSurfaceHandle | null | undefined>(
  undefined,
);

/** Props for {@link AgentSurface}. */
export interface AgentSurfaceProps {
  readonly face: AgentFaceDefinition;
  /** The business entity this surface presents. Updates apply without remounting. */
  readonly entity?: AgentEntityReference;
  readonly children: ReactNode;
}

/**
 * Registers a mounted surface instance for its children. Nested surfaces
 * build the parent/child graph automatically. Registration happens in an
 * effect and is cleaned up on unmount, so React Strict Mode's
 * mount/unmount/remount cycle never leaks or duplicates registrations.
 *
 * Define `face` at module scope (via `defineAgentFace`) — passing a new
 * object each render would remount the surface.
 *
 * @example
 * ```tsx
 * <AgentSurface face={invoiceFace} entity={{ type: "invoice", id: invoice.id }}>
 *   <InvoiceEditor invoice={invoice} />
 * </AgentSurface>
 * ```
 */
export function AgentSurface(props: AgentSurfaceProps): ReactNode {
  const { face, entity, children } = props;
  const runtime = useAgentRuntime();
  const parent = useContext(SurfaceContext);
  const [registration, setRegistration] =
    useState<AgentSurfaceRegistration | null>(null);

  const parentInstanceId = parent?.instanceId;

  useEffect(() => {
    const next = runtime.registerSurface({
      face,
      ...(parentInstanceId !== undefined ? { parentInstanceId } : {}),
    });
    setRegistration(next);
    return () => {
      next.unregister();
    };
    // The entity is intentionally not a dependency: identity changes update
    // the mounted instance below instead of remounting it.
  }, [runtime, face, parentInstanceId]);

  useEffect(() => {
    registration?.setEntity(entity);
  }, [registration, entity]);

  const value = useMemo<AgentSurfaceHandle | null>(
    () =>
      registration === null
        ? null
        : {
            instanceId: registration.instanceId,
            bumpRevision: () => registration.bumpRevision(),
          },
    [registration],
  );

  return (
    <SurfaceContext.Provider value={value}>{children}</SurfaceContext.Provider>
  );
}

/**
 * The nearest mounted surface, or `null` while its registration effect has
 * not committed yet.
 *
 * @throws when used outside an {@link AgentSurface}.
 */
export function useAgentSurface(): AgentSurfaceHandle | null {
  const value = useContext(SurfaceContext);
  if (value === undefined) {
    throw new Error(
      "useAgentSurface must be used within an <AgentSurface>. Wrap the feature in <AgentSurface face={...}> to expose it to agents.",
    );
  }
  return value;
}
