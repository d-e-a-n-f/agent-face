/**
 * The AgentFace assistant layer: a provider-neutral model adapter contract,
 * a deterministic mock adapter, and the assistant loop that lets a model
 * operate an AgentFace runtime.
 *
 * The model never calls application closures directly. The flow is always
 * model → adapter → assistant loop → runtime (policy, validation,
 * confirmation) → application action. Confirmation belongs to the user and
 * is never exposed to the model as a tool.
 *
 * The Claude-on-Bedrock adapter lives in the separate
 * `@agentface/assistant/bedrock` entry point (server-side only).
 *
 * @packageDocumentation
 */

export { createAssistant } from "./assistant.js";
export type {
  AgentFaceAssistant,
  ConfirmationDecision,
  CreateAssistantOptions,
} from "./assistant.js";

export { createMockModelAdapter } from "./mock.js";
export type { MockScriptStep } from "./mock.js";

export type {
  AgentModelAdapter,
  AgentModelRequest,
  AgentModelResponse,
  AgentModelStopReason,
  AgentModelToolCall,
  AgentModelToolDefinition,
  AssistantContentPart,
  AssistantMessage,
} from "./types.js";
