"use client";

import type {
  AgentActionPreview,
  AgentActionRecommendation,
  AgentConfirmationRule,
  AgentInputSchema,
  AgentPrecondition,
  AgentSensitivity,
} from "@agentface/core";
import { defineAgentAction, isAgentFaceError } from "@agentface/core";
import { useEffect, useRef } from "react";
import { useAgentBoundary } from "./boundary.js";
import { useAgentRuntime } from "./context.js";
import { useAgentSurface } from "./surface.js";

/** Options for {@link useAgentAction}. */
export interface UseAgentActionOptions<
  TInput = Record<string, never>,
  TResult = unknown,
  TPreview extends AgentActionPreview = AgentActionPreview,
> {
  readonly id: string;
  /** Defaults to a humanised form of the id, e.g. "save-draft" → "Save draft". */
  readonly name?: string;
  readonly description: string;
  /** Omit for zero-input actions — an empty-object schema is used. */
  readonly input?: AgentInputSchema<TInput>;
  readonly sensitivity?: AgentSensitivity;
  readonly tags?: readonly string[];
  readonly confirmation?: AgentConfirmationRule<TInput>;
  readonly preconditions?: readonly AgentPrecondition[];
  readonly preview?: (input: TInput) => TPreview | Promise<TPreview>;
  readonly execute: (input: TInput) => TResult | Promise<TResult>;
  /** Whether the action is currently invokable. Defaults to always available. */
  readonly isAvailable?: () => boolean;
  /** Marks this action as a suggested next step while its condition holds. */
  readonly recommend?: AgentActionRecommendation;
  /** Action-level revision, when finer-grained than the surface revision. */
  readonly getRevision?: () => number;
}

/**
 * Exposes a business operation as an agent-invokable action on the nearest
 * {@link AgentSurface}.
 *
 * The registration is created once per mount and removed on unmount. Every
 * closure — `execute`, `preview`, precondition checks, conditional
 * confirmation, availability — is routed through the latest render's options,
 * so an action invoked after many rerenders sees current state. Strict Mode
 * safe.
 *
 * The action's identity and metadata (`id`, `name`, `description`, schema,
 * tags, sensitivity, the *shape* of confirmation and preconditions) are fixed
 * at mount; only the closures stay live.
 *
 * @example
 * ```tsx
 * useAgentAction({
 *   id: "send",
 *   name: "Send invoice",
 *   description: "Send the completed invoice to the customer",
 *   input: fromZod(z.object({ message: z.string().optional() })),
 *   confirmation: "always",
 *   execute: async (input) => sendInvoice(invoice.id, input),
 * });
 * ```
 *
 * @throws when used outside `<AgentFaceProvider>` or `<AgentSurface>`.
 */
export function useAgentAction<
  TInput = Record<string, never>,
  TResult = unknown,
  TPreview extends AgentActionPreview = AgentActionPreview,
>(options: UseAgentActionOptions<TInput, TResult, TPreview>): void {
  const runtime = useAgentRuntime();
  const surface = useAgentSurface();
  const boundary = useAgentBoundary();

  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const instanceId = surface?.instanceId;
  const actionId = options.id;
  const boundarySensitivity = boundary.maximumSensitivity;
  const hasRevision = options.getRevision !== undefined;

  useEffect(() => {
    if (instanceId === undefined) {
      return;
    }
    const initial = latest.current;
    const sensitivity = initial.sensitivity ?? boundarySensitivity;

    // Confirmation: keep the declared kind, but route a conditional's
    // evaluate through the latest render.
    const confirmation: AgentConfirmationRule<TInput> | undefined =
      initial.confirmation === undefined ||
      initial.confirmation === "never" ||
      initial.confirmation === "always"
        ? initial.confirmation
        : {
            type: "conditional",
            ...(initial.confirmation.reason !== undefined
              ? { reason: initial.confirmation.reason }
              : {}),
            evaluate: (input) => {
              const rule = latest.current.confirmation;
              return typeof rule === "object" ? rule.evaluate(input) : rule === "always";
            },
          };

    // Preconditions: metadata fixed at mount, checks read the latest render
    // by position.
    const preconditions = initial.preconditions?.map(
      (precondition, index): AgentPrecondition => ({
        id: precondition.id,
        description: precondition.description,
        check: () => latest.current.preconditions?.[index]?.check() ?? true,
      }),
    );

    // Recommendation closures route through the latest render like every
    // other live behaviour.
    const recommend: AgentActionRecommendation | undefined =
      initial.recommend === undefined
        ? undefined
        : {
            when: () => latest.current.recommend?.when() ?? false,
            ...(initial.recommend.reason !== undefined
              ? { reason: initial.recommend.reason }
              : {}),
            instruction: () => {
              const current = latest.current.recommend;
              return typeof current?.instruction === "function"
                ? current.instruction()
                : (current?.instruction ??
                  latest.current.name ??
                  latest.current.id);
            },
            ...(initial.recommend.priority !== undefined
              ? { priority: initial.recommend.priority }
              : {}),
          };

    const previewDeclared = initial.preview !== undefined;
    let registration;
    try {
      registration = runtime.registerAction(instanceId, {
      definition: defineAgentAction<TInput, TResult, AgentActionPreview>({
        id: initial.id,
        ...(initial.name !== undefined ? { name: initial.name } : {}),
        description: initial.description,
        ...(initial.input !== undefined
          ? {
              input: {
                parse: (raw) =>
                  (latest.current.input ?? initial.input!).parse(raw),
                ...(initial.input.toJSONSchema !== undefined
                  ? {
                      toJSONSchema: () =>
                        latest.current.input?.toJSONSchema?.() ?? {},
                    }
                  : {}),
              },
            }
          : {}),
        ...(sensitivity !== undefined ? { sensitivity } : {}),
        ...(initial.tags !== undefined ? { tags: initial.tags } : {}),
        ...(confirmation !== undefined ? { confirmation } : {}),
        ...(preconditions !== undefined ? { preconditions } : {}),
        ...(recommend !== undefined ? { recommend } : {}),
        ...(previewDeclared
          ? {
              preview: async (input: TInput): Promise<AgentActionPreview> =>
                (await latest.current.preview?.(input)) ?? { summary: "" },
            }
          : {}),
        execute: (input) => latest.current.execute(input),
      }),
      isAvailable: () => latest.current.isAvailable?.() ?? true,
      ...(hasRevision
        ? { getRevision: () => latest.current.getRevision?.() ?? 0 }
        : {}),
      });
    } catch (caught) {
      // During Strict Mode's remount cycle (or a parent surface remount) this
      // effect can fire while the context still carries the just-unregistered
      // instance id. Skip — the effect re-runs with the new id once the
      // surface's registration state commits.
      if (isAgentFaceError(caught) && caught.code === "SURFACE_NOT_FOUND") {
        return;
      }
      throw caught;
    }
    return () => {
      registration.unregister();
    };
  }, [runtime, instanceId, actionId, boundarySensitivity, hasRevision]);
}
