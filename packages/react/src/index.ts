/**
 * React bindings for the AgentFace runtime. Components and hooks register
 * live surfaces, resources, and actions with the runtime, keeping closures
 * current across rerenders without re-registration and behaving correctly
 * under React Strict Mode.
 *
 * All exports are client-side (`"use client"`) — AgentFace registration is
 * runtime browser behaviour; React Server Components are not supported.
 *
 * @packageDocumentation
 */

export {
  AgentFaceProvider,
  useAgentContext,
  useAgentRuntime,
} from "./context.js";
export type {
  AgentFaceApplicationInfo,
  AgentFaceContextValue,
  AgentFaceProviderProps,
} from "./context.js";

export { AgentSurface, useAgentSurface } from "./surface.js";
export type { AgentSurfaceHandle, AgentSurfaceProps } from "./surface.js";

export { AgentBoundary, useAgentBoundary } from "./boundary.js";
export type { AgentBoundaryPolicy, AgentBoundaryProps } from "./boundary.js";

export { useAgentResource } from "./use-agent-resource.js";
export type { UseAgentResourceOptions } from "./use-agent-resource.js";

export { useAgentAction } from "./use-agent-action.js";
export type { UseAgentActionOptions } from "./use-agent-action.js";
