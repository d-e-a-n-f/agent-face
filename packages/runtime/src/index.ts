/**
 * The in-memory AgentFace runtime: registry and policy-mediated operating
 * layer for mounted surfaces, resources, and actions. Enforces the action
 * lifecycle (validate → preconditions → revision → policy → preview →
 * confirmation → execute) and emits structured trace events.
 *
 * @packageDocumentation
 */

export { createAgentRuntime } from "./create-runtime.js";
export type {
  AgentRuntimeIdKind,
  CreateAgentRuntimeOptions,
} from "./create-runtime.js";

export type {
  AgentActionDescriptor,
  AgentActionExecutionResult,
  AgentActionSnapshot,
  AgentCapabilityRegistration,
  AgentConfirmationPolicyKind,
  AgentDiscoveredSurface,
  AgentDiscoveryQuery,
  AgentDiscoveryResult,
  AgentResourceDescriptor,
  AgentResourceSnapshot,
  AgentRuntime,
  AgentRuntimeListener,
  AgentSurfaceRegistration,
  AgentSurfaceSnapshot,
  ConfirmActionRequest,
  ConfirmedAgentAction,
  ExecuteActionRequest,
  PrepareActionRequest,
  PreparedAgentAction,
  ReadResourceRequest,
  ReadResourceResult,
  RegisterActionInput,
  RegisterResourceInput,
  RegisterSurfaceInput,
  UpdateResourceInput,
} from "./types.js";
