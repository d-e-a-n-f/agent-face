"use client";

import type { AgentSensitivity, JsonValue } from "@agentface/core";
import { compareSensitivity, defineAgentResource } from "@agentface/core";
import { useEffect, useRef } from "react";
import { useAgentBoundary } from "./boundary.js";
import { useAgentRuntime } from "./context.js";
import { useAgentSurface } from "./surface.js";

/** Metadata shared by both forms of {@link useAgentResource}. */
interface UseAgentResourceBase<TValue> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly sensitivity?: AgentSensitivity;
  readonly tags?: readonly string[];
  /** Converts the live value into its JSON-safe agent-visible form. */
  readonly serialize?: (value: TValue) => JsonValue;
}

/** Value form: pass the current value each render. */
interface UseAgentResourceValueForm<TValue>
  extends UseAgentResourceBase<TValue> {
  readonly value: TValue;
  readonly revision?: number;
  readonly getValue?: never;
  readonly getRevision?: never;
}

/** Getter form: pass stable-shaped getters that read current state. */
interface UseAgentResourceGetterForm<TValue>
  extends UseAgentResourceBase<TValue> {
  readonly getValue: () => TValue;
  readonly getRevision?: () => number;
  readonly value?: never;
  readonly revision?: never;
}

/** Options for {@link useAgentResource}. */
export type UseAgentResourceOptions<TValue> =
  | UseAgentResourceValueForm<TValue>
  | UseAgentResourceGetterForm<TValue>;

/**
 * Exposes a piece of feature state as an agent-readable resource on the
 * nearest {@link AgentSurface}.
 *
 * The registration is created once per mount and removed on unmount; reads
 * always go through the latest options, so rerenders update what agents see
 * without unregister/re-register churn. Strict Mode safe.
 *
 * @example
 * ```tsx
 * useAgentResource({
 *   id: "selected-customers",
 *   name: "Selected customers",
 *   description: "Customers selected in the table",
 *   value: selectedCustomers,
 *   revision: selectionRevision,
 * });
 * ```
 *
 * @throws when used outside `<AgentFaceProvider>` or `<AgentSurface>`.
 */
export function useAgentResource<TValue>(
  options: UseAgentResourceOptions<TValue>,
): void {
  const runtime = useAgentRuntime();
  const surface = useAgentSurface();
  const boundary = useAgentBoundary();

  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const boundarySensitivity = boundary.maximumSensitivity;
  if (
    process.env.NODE_ENV !== "production" &&
    options.sensitivity !== undefined &&
    boundarySensitivity !== undefined &&
    compareSensitivity(options.sensitivity, boundarySensitivity) > 0
  ) {
    console.warn(
      `Resource "${options.id}" declares sensitivity "${options.sensitivity}" above its <AgentBoundary> maximum "${boundarySensitivity}".`,
    );
  }

  const instanceId = surface?.instanceId;
  const resourceId = options.id;
  const hasRevision =
    options.revision !== undefined || options.getRevision !== undefined;

  useEffect(() => {
    if (instanceId === undefined) {
      return;
    }
    const initial = latest.current;
    const sensitivity = initial.sensitivity ?? boundarySensitivity;
    const registration = runtime.registerResource<TValue>(instanceId, {
      definition: defineAgentResource<TValue>({
        id: initial.id,
        name: initial.name,
        description: initial.description,
        ...(sensitivity !== undefined ? { sensitivity } : {}),
        ...(initial.tags !== undefined ? { tags: initial.tags } : {}),
        serialize: (value) => {
          const current = latest.current;
          return current.serialize !== undefined
            ? current.serialize(value)
            : (value as JsonValue);
        },
      }),
      getValue: () => {
        const current = latest.current;
        return current.getValue !== undefined
          ? current.getValue()
          : (current.value as TValue);
      },
      ...(hasRevision
        ? {
            getRevision: () => {
              const current = latest.current;
              return current.getRevision !== undefined
                ? current.getRevision()
                : (current.revision ?? 0);
            },
          }
        : {}),
    });
    return () => {
      registration.unregister();
    };
  }, [runtime, instanceId, resourceId, boundarySensitivity, hasRevision]);
}
