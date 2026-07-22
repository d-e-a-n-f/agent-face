"use client";

import type {
  AgentApplicationManifest,
  AgentPrincipal,
  UserPrincipal,
} from "@agentface/core";
import type { AgentHelpArticle } from "@agentface/react";
import { AgentFaceKnowledge, AgentFaceProvider } from "@agentface/react";
import { DEFAULT_ASSISTANT_SYSTEM_PROMPT } from "@agentface/assistant";
import type { AgentFaceAssistantProps } from "@agentface/assistant/react";
import { AgentFaceAssistant } from "@agentface/assistant/react";
import { AgentFaceDevTools } from "@agentface/devtools";
import type { AgentPolicyEngine, AgentRuntime } from "@agentface/runtime";
import { createAgentRuntime } from "@agentface/runtime";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import type { AgentFaceNavigationProps } from "./navigation.js";
import { AgentFaceNavigation } from "./navigation.js";

/** Props for {@link AgentFaceApp}. */
export interface AgentFaceAppProps {
  readonly children: ReactNode;
  /** Identifies the app to agents. */
  readonly application?: { readonly id: string; readonly name: string };
  readonly user?: UserPrincipal;
  readonly agent?: AgentPrincipal;
  /** Policy engine; defaults to allow-all (development-friendly). */
  readonly policy?: AgentPolicyEngine;
  /** Bring your own runtime instead (overrides `policy`). */
  readonly runtime?: AgentRuntime;
  /**
   * The static application manifest (see `defineAgentApplication`): every
   * screen, its faces, its entities. Supplies navigation routes (unless
   * `routes` overrides), the `application-map` resource, the assistant's
   * app-wide planning context, and the DevTools coverage report.
   */
  readonly manifest?: AgentApplicationManifest;
  /** Screens the agent may navigate to (`:params` supported). Defaults to the manifest's routes. */
  readonly routes?: AgentFaceNavigationProps["routes"];
  /** App help articles for grounded answers. Omit to skip knowledge. */
  readonly help?: readonly AgentHelpArticle[];
  /**
   * The floating assistant widget: `true` (default) with defaults, `false`
   * to omit, or its props to configure (title, position, endpoint, adapter…).
   */
  readonly assistant?: boolean | Omit<AgentFaceAssistantProps, "children">;
  /**
   * The DevTools panel: `"auto"` (default) shows it outside production
   * builds, `true` always, `false` never.
   */
  readonly devtools?: boolean | "auto";
}

/**
 * Everything AgentFace needs, in one component: creates the runtime, hosts
 * the provider, and wires the assistant widget, navigation, app knowledge,
 * and dev-only DevTools. Drop it in your root layout:
 *
 * @example
 * ```tsx
 * // app/layout.tsx (via a small "use client" wrapper)
 * <AgentFaceApp
 *   application={{ id: "acme", name: "Acme" }}
 *   routes={[{ path: "/clients/:clientId", description: "One client" }]}
 *   help={HELP_ARTICLES}
 * >
 *   {children}
 * </AgentFaceApp>
 * ```
 *
 * Pair with the model endpoint from `createAgentFaceRouteHandler` at
 * `/api/agentface`. For finer control, compose the pieces yourself — this
 * component is only defaults.
 */
export function AgentFaceApp(props: AgentFaceAppProps): ReactNode {
  const {
    children,
    application,
    user,
    agent,
    manifest,
    help,
    assistant = true,
    devtools = "auto",
  } = props;

  // Navigation routes come from the manifest unless explicitly overridden.
  const routes =
    props.routes ??
    manifest?.routes.map((route) => ({
      path: route.path,
      description: route.description,
    }));

  // The runtime is created once, but principals resolve per operation from
  // the latest props — login, logout, or agent changes apply immediately to
  // policy evaluation (and invalidate outstanding preparations).
  const principalsRef = useRef({
    ...(user !== undefined ? { user } : {}),
    ...(agent !== undefined ? { agent } : {}),
  });
  principalsRef.current = {
    ...(user !== undefined ? { user } : {}),
    ...(agent !== undefined ? { agent } : {}),
  };
  const [runtime] = useState<AgentRuntime>(
    () =>
      props.runtime ??
      createAgentRuntime({
        ...(props.policy !== undefined ? { policy: props.policy } : {}),
        principals: () => principalsRef.current,
      }),
  );

  const showDevtools =
    devtools === "auto" ? process.env.NODE_ENV !== "production" : devtools;
  const baseAssistantProps =
    assistant === false ? null : assistant === true ? {} : assistant;

  // The manifest gives the assistant app-wide planning context: it learns
  // every screen that exists, not just the one currently mounted.
  const assistantProps =
    baseAssistantProps === null
      ? null
      : manifest === undefined
        ? baseAssistantProps
        : {
            ...baseAssistantProps,
            systemPrompt: `${
              baseAssistantProps.systemPrompt ?? DEFAULT_ASSISTANT_SYSTEM_PROMPT
            }\n\n## Application screens\nThe whole application (navigate to a screen to make its capabilities available):\n${manifest.routes
              .map(
                (route) =>
                  `- ${route.path} — ${route.description}${route.surfaces.length > 0 ? ` (capabilities: ${route.surfaces.join(", ")})` : ""}`,
              )
              .join("\n")}`,
          };

  return (
    <AgentFaceProvider
      runtime={runtime}
      {...(application !== undefined ? { application } : {})}
      {...(user !== undefined ? { user } : {})}
      {...(agent !== undefined ? { agent } : {})}
      {...(manifest !== undefined ? { manifest } : {})}
    >
      {routes !== undefined ? (
        <AgentFaceNavigation
          routes={routes}
          {...(manifest !== undefined ? { manifest } : {})}
        />
      ) : null}
      {help !== undefined ? <AgentFaceKnowledge articles={help} /> : null}
      {children}
      {assistantProps !== null ? <AgentFaceAssistant {...assistantProps} /> : null}
      {showDevtools ? (
        // Right clearance keeps the DevTools toggle clear of the floating
        // assistant launcher.
        <div style={{ paddingRight: 170 }}>
          <AgentFaceDevTools />
        </div>
      ) : null}
    </AgentFaceProvider>
  );
}
