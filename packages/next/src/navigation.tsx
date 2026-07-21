"use client";

import type { AgentInputSchema } from "@agentface/core";
import { AgentFaceError, defineAgentFace } from "@agentface/core";
import {
  AgentSurface,
  useAgentAction,
  useAgentResource,
  useAgentRuntime,
} from "@agentface/react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

const navigationFace = defineAgentFace({
  id: "app.navigation",
  name: "App navigation",
  description:
    "Where the user is, where they've been (screens visited and actions taken), and the ability to move between screens",
  version: "0.1.0",
  tags: ["navigation"],
});

/** A navigable route: the path plus an optional description for the agent. */
export interface AgentFaceRoute {
  readonly path: string;
  readonly description?: string;
}

/** Props for {@link AgentFaceNavigation}. */
export interface AgentFaceNavigationProps {
  /** The screens the agent may navigate to. */
  readonly routes: readonly (string | AgentFaceRoute)[];
  /** Journey entries retained. Default 25. */
  readonly journeyLimit?: number;
  /**
   * How long the navigate action waits after pushing the route, giving the
   * new screen's surfaces time to mount before the agent re-discovers.
   * Default 400ms.
   */
  readonly settleDelayMs?: number;
}

type JourneyEntry =
  | { readonly kind: "navigation"; readonly path: string }
  | {
      readonly kind: "action";
      readonly actionId: string;
      readonly surfaceInstanceId: string;
    };

interface NavigateInput {
  readonly path: string;
}

/**
 * Route templates may contain `:param` segments (e.g.
 * `/portal/clients/:clientId`); a concrete path matches when every static
 * segment is equal and every param segment is non-empty.
 */
function matchesTemplate(template: string, path: string): boolean {
  const templateSegments = template.split("/");
  const pathSegments = path.split("/");
  if (templateSegments.length !== pathSegments.length) {
    return false;
  }
  return templateSegments.every((segment, index) => {
    const candidate = pathSegments[index] ?? "";
    return segment.startsWith(":") ? candidate.length > 0 : segment === candidate;
  });
}

function pathSchema(templates: readonly string[]): AgentInputSchema<NavigateInput> {
  return {
    parse(input: unknown): NavigateInput {
      const path =
        typeof input === "object" && input !== null
          ? (input as { path?: unknown }).path
          : undefined;
      if (
        typeof path !== "string" ||
        !templates.some((template) => matchesTemplate(template, path))
      ) {
        throw new AgentFaceError({
          code: "INVALID_INPUT",
          message: `path must match one of: ${templates.join(", ")} (replace :params with real values)`,
        });
      }
      return { path };
    },
    toJSONSchema: () => ({
      type: "object",
      properties: {
        path: {
          type: "string",
          description: `A concrete path matching one of these templates (replace :params with real ids): ${templates.join(", ")}`,
        },
      },
      required: ["path"],
      additionalProperties: false,
    }),
  };
}

function NavigationCapabilities(
  props: Required<Omit<AgentFaceNavigationProps, "routes">> & {
    readonly routes: readonly AgentFaceRoute[];
  },
): null {
  const { routes, journeyLimit, settleDelayMs } = props;
  const runtime = useAgentRuntime();
  const router = useRouter();
  const pathname = usePathname();
  const journeyRef = useRef<JourneyEntry[]>([]);

  // The journey is assembled from two sources the app already has: route
  // changes, and the runtime's own trace of executed actions.
  useEffect(() => {
    journeyRef.current = [
      ...journeyRef.current,
      { kind: "navigation" as const, path: pathname },
    ].slice(-journeyLimit);
  }, [pathname, journeyLimit]);

  useEffect(
    () =>
      runtime.subscribe((event) => {
        if (event.type === "action.succeeded") {
          journeyRef.current = [
            ...journeyRef.current,
            {
              kind: "action" as const,
              actionId: event.actionId,
              surfaceInstanceId: event.instanceId,
            },
          ].slice(-journeyLimit);
        }
      }),
    [runtime, journeyLimit],
  );

  useAgentResource({
    id: "current-location",
    name: "Current location",
    description: "The screen the user is currently on",
    getValue: () => ({ path: pathname }),
  });

  useAgentResource({
    id: "journey",
    name: "Journey",
    description:
      "Where the user came from: recent screens visited and actions taken, oldest first. Read this when a request depends on what happened on earlier screens.",
    getValue: () => journeyRef.current,
    getRevision: () => journeyRef.current.length,
  });

  useAgentAction({
    id: "navigate",
    name: "Navigate",
    description: `Move the app to another screen. After navigating, the new screen's surfaces mount and the old screen's disappear — re-discover before acting. Conversation context is kept across screens, so values read on one screen can be used to fill things in on another. Screens: ${routes
      .map(
        (route) =>
          `${route.path}${route.description !== undefined ? ` (${route.description})` : ""}`,
      )
      .join(", ")}`,
    input: pathSchema(routes.map((route) => route.path)),
    execute: async (input) => {
      router.push(input.path);
      await new Promise((resolve) => setTimeout(resolve, settleDelayMs));
      return { navigatedTo: input.path };
    },
  });

  return null;
}

/**
 * Mounts the app-level navigation surface: where the user is
 * (`current-location`), where they've been (`journey` — screens visited and
 * actions taken, sourced from the runtime's own trace), and a `navigate`
 * action restricted to the routes you declare.
 *
 * This is what lets an assistant know where the user came from, move between
 * screens, and carry context from one screen into another. Render it once
 * inside your `<AgentFaceProvider>`, typically in the root layout.
 *
 * @example
 * ```tsx
 * <AgentFaceNavigation
 *   routes={[
 *     { path: "/invoices", description: "Invoice list" },
 *     { path: "/customers", description: "Customer table" },
 *   ]}
 * />
 * ```
 */
export function AgentFaceNavigation(
  props: AgentFaceNavigationProps,
): ReactNode {
  const routes = props.routes.map(
    (route): AgentFaceRoute =>
      typeof route === "string" ? { path: route } : route,
  );
  return (
    <AgentSurface face={navigationFace}>
      <NavigationCapabilities
        routes={routes}
        journeyLimit={props.journeyLimit ?? 25}
        settleDelayMs={props.settleDelayMs ?? 400}
      />
    </AgentSurface>
  );
}
