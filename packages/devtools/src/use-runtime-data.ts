"use client";

import type {
  AgentDiscoveryResult,
  AgentSurfaceSnapshot,
} from "@agentface/runtime";
import { useAgentRuntime } from "@agentface/react";
import { useEffect, useState } from "react";

/**
 * Event types that indicate the mounted world changed. Reads and policy
 * decisions are excluded on purpose: the panel's own inspection emits them,
 * and refreshing on them would loop forever.
 */
const STRUCTURAL_EVENTS = new Set([
  "surface.registered",
  "surface.unregistered",
  "action.preparing",
  "action.prepared",
  "action.confirmation-required",
  "action.confirmed",
  "action.executing",
  "action.succeeded",
  "action.failed",
]);

/** Increments whenever the runtime's structural state changes. */
export function useRuntimeVersion(): number {
  const runtime = useAgentRuntime();
  const [version, setVersion] = useState(0);
  useEffect(
    () =>
      runtime.subscribe((event) => {
        if (STRUCTURAL_EVENTS.has(event.type)) {
          setVersion((current) => current + 1);
        }
      }),
    [runtime],
  );
  return version;
}

/** The current discovery result, refreshed on structural changes. */
export function useDiscovery(version: number): AgentDiscoveryResult {
  const runtime = useAgentRuntime();
  const [result, setResult] = useState<AgentDiscoveryResult>({ surfaces: [] });
  useEffect(() => {
    let cancelled = false;
    void runtime.discover().then((discovered) => {
      if (!cancelled) {
        setResult(discovered);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [runtime, version]);
  return result;
}

/** A full snapshot of the selected surface, or null while loading/unselected. */
export function useSurfaceSnapshot(
  instanceId: string | null,
  version: number,
): AgentSurfaceSnapshot | null {
  const runtime = useAgentRuntime();
  const [snapshot, setSnapshot] = useState<AgentSurfaceSnapshot | null>(null);
  useEffect(() => {
    if (instanceId === null) {
      setSnapshot(null);
      return;
    }
    let cancelled = false;
    runtime
      .inspectSurface(instanceId)
      .then((next) => {
        if (!cancelled) {
          setSnapshot(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSnapshot(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [runtime, instanceId, version]);
  return snapshot;
}
