import type { AgentPrincipal, UserPrincipal } from "@agentface/core";
import { AgentFaceProvider } from "@agentface/react";
import type { AgentDiscoveredSurface, AgentRuntime } from "@agentface/runtime";
import type { RenderResult } from "@testing-library/react";
import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { StrictMode } from "react";
import { createTestAgentRuntime } from "./test-runtime.js";

/** Options for {@link renderWithAgentFace}. */
export interface RenderWithAgentFaceOptions {
  /** A runtime to use; defaults to a fresh deterministic test runtime. */
  readonly runtime?: AgentRuntime;
  readonly user?: UserPrincipal;
  readonly agent?: AgentPrincipal;
  /** Wrap in `<StrictMode>` (the default) to catch registration leaks. */
  readonly strictMode?: boolean;
}

/** The render result plus the runtime hosting the tree. */
export interface RenderWithAgentFaceResult extends RenderResult {
  readonly runtime: AgentRuntime;
}

/**
 * Renders a React tree inside an `AgentFaceProvider` backed by a
 * deterministic test runtime, under Strict Mode by default.
 *
 * Import from `@agentface/testing/react` — the main entry point has no React
 * dependency.
 *
 * @example
 * ```ts
 * const { runtime } = renderWithAgentFace(
 *   <AgentSurface face={invoiceFace}><InvoiceEditor /></AgentSurface>,
 * );
 * const surfaces = await getMountedSurfaces(runtime);
 * ```
 */
export function renderWithAgentFace(
  ui: ReactElement,
  options: RenderWithAgentFaceOptions = {},
): RenderWithAgentFaceResult {
  const runtime = options.runtime ?? createTestAgentRuntime();
  const strict = options.strictMode ?? true;
  const wrap = (node: ReactNode): ReactElement => (
    <AgentFaceProvider
      runtime={runtime}
      {...(options.user !== undefined ? { user: options.user } : {})}
      {...(options.agent !== undefined ? { agent: options.agent } : {})}
    >
      {node}
    </AgentFaceProvider>
  );
  const result = render(ui, {
    wrapper: ({ children }) =>
      strict ? <StrictMode>{wrap(children)}</StrictMode> : wrap(children),
  });
  return { ...result, runtime };
}

/** All currently mounted surfaces, via the runtime's own discovery. */
export async function getMountedSurfaces(
  runtime: AgentRuntime,
): Promise<readonly AgentDiscoveredSurface[]> {
  const { surfaces } = await runtime.discover();
  return surfaces;
}
