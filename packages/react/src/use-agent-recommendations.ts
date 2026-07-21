"use client";

import type { AgentRecommendedAction } from "@agentface/runtime";
import { useEffect, useState } from "react";
import { useAgentRuntime } from "./context.js";

/** Options for {@link useAgentRecommendations}. */
export interface UseAgentRecommendationsOptions {
  /**
   * Re-evaluation interval in milliseconds, for state changes that emit no
   * runtime event (e.g. the human typing into a form). Default 1000; 0
   * disables polling (event-driven only).
   */
  readonly pollMs?: number;
  /** Maximum recommendations returned. Default 3. */
  readonly limit?: number;
}

/**
 * The currently recommended next-step actions, kept live: re-evaluated on
 * every runtime event and on a light polling interval, so recommendations
 * appear, change, and disappear as data fills in.
 *
 * Recommendations come from action definitions' `recommend` declarations —
 * the application decides what the sensible next step is; this hook only
 * observes.
 */
export function useAgentRecommendations(
  options: UseAgentRecommendationsOptions = {},
): readonly AgentRecommendedAction[] {
  const runtime = useAgentRuntime();
  const pollMs = options.pollMs ?? 1000;
  const limit = options.limit ?? 3;
  const [recommendations, setRecommendations] = useState<
    readonly AgentRecommendedAction[]
  >([]);

  useEffect(() => {
    const refresh = (): void => {
      const next = runtime.getRecommendedActions().slice(0, limit);
      setRecommendations((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    refresh();
    const unsubscribe = runtime.subscribe(() => refresh());
    const timer =
      pollMs > 0 ? setInterval(refresh, pollMs) : undefined;
    return () => {
      unsubscribe();
      if (timer !== undefined) {
        clearInterval(timer);
      }
    };
  }, [runtime, pollMs, limit]);

  return recommendations;
}
