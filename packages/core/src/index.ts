/**
 * AgentFace contract types and definition helpers.
 *
 * `@agentface/core` defines the AgentFace language: faces, surfaces,
 * resources, actions, preconditions, confirmation rules, principals, errors,
 * and trace events. It is framework-independent — no React, no browser APIs,
 * no runtime registries. The Zod input-schema adapter lives in the separate
 * `@agentface/core/zod` entry point.
 *
 * @packageDocumentation
 */

export {
  defineAgentAction,
  defineAgentEvent,
  defineAgentFace,
  defineAgentResource,
} from "./definitions.js";
export type { AgentEventDefinition } from "./definitions.js";

export type {
  AgentActionChange,
  AgentActionDefinition,
  AgentActionPreview,
  AgentActionResult,
  AgentConfirmationRule,
  AgentPrecondition,
} from "./actions.js";

export type { AgentEntityReference } from "./entities.js";

export {
  AGENT_ERROR_CODES,
  AgentFaceError,
  isAgentError,
  isAgentFaceError,
} from "./errors.js";
export type { AgentError, AgentErrorCode } from "./errors.js";

export type {
  AgentPolicyEffect,
  AgentRuntimeEvent,
  AgentRuntimeEventType,
  AgentTraceEvent,
} from "./events.js";

export type {
  AgentFaceDefinition,
  AgentFaceRelationship,
  AgentFaceRelationshipType,
} from "./faces.js";

export type {
  AgentActionId,
  AgentEventId,
  AgentFaceId,
  AgentResourceId,
  AgentSurfaceInstanceId,
  AgentTraceId,
} from "./ids.js";

export type { JsonObject, JsonPrimitive, JsonValue } from "./json.js";

export type {
  AgentFacePrincipal,
  AgentPrincipal,
  DelegationContext,
  UserPrincipal,
} from "./principals.js";

export type { AgentResourceDefinition } from "./resources.js";

export type { AgentInputSchema, InferAgentInput } from "./schema.js";

export { AGENT_SENSITIVITY_LEVELS, compareSensitivity } from "./sensitivity.js";
export type { AgentSensitivity } from "./sensitivity.js";

export type { AgentSurfaceInstance } from "./surfaces.js";
