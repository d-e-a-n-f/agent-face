import type {
  AgentActionDefinition,
  AgentActionId,
  AgentActionPreview,
  AgentActionResult,
  AgentEntityReference,
  AgentFaceDefinition,
  AgentFaceId,
  AgentResourceDefinition,
  AgentResourceId,
  AgentSensitivity,
  AgentSurfaceInstance,
  AgentSurfaceInstanceId,
  AgentTraceEvent,
  AgentTraceId,
  JsonObject,
  JsonValue,
} from "@agentface/core";
import type { AgentPolicyDecision, PrincipalContext } from "@agentface/policy";

/** Registers a mounted surface. */
export interface RegisterSurfaceInput {
  readonly face: AgentFaceDefinition;
  readonly entity?: AgentEntityReference;
  /** The enclosing mounted surface, for nested features. */
  readonly parentInstanceId?: AgentSurfaceInstanceId;
}

/**
 * Handle returned by `registerSurface`. The owning feature uses it to keep
 * the mounted instance current and to unregister on unmount.
 */
export interface AgentSurfaceRegistration {
  readonly instanceId: AgentSurfaceInstanceId;
  /**
   * Updates the entity this surface presents. Changing the entity's
   * *identity* (type or id) invalidates every outstanding preparation for
   * the surface and bumps its revision — a confirmation captured for one
   * entity can never execute against another. Prefer remounting the surface
   * for a different entity; `displayName`-only updates are free.
   */
  setEntity(entity: AgentEntityReference | undefined): void;
  /** Increments the instance revision. Call after state mutations so stale prepared actions are rejected. */
  bumpRevision(): number;
  /** Unregisters the surface and all its capabilities. Idempotent. */
  unregister(): void;
}

/** Registers a live resource: metadata plus getters that always read current state. */
export interface RegisterResourceInput<TValue> {
  readonly definition: AgentResourceDefinition<TValue>;
  /** Reads the current value. Registered once; replace via `update()` on rerender. */
  readonly getValue: () => TValue;
  /** Resource-level revision, when finer-grained than the surface revision. */
  readonly getRevision?: () => number;
}

/** Live closures replaceable on a registered resource. */
export interface UpdateResourceInput<TValue> {
  readonly getValue: () => TValue;
  readonly getRevision?: () => number;
}

/** Registers a live action: the typed definition plus availability/revision getters. */
export interface RegisterActionInput<
  TInput,
  TResult extends JsonValue,
  TPreview extends AgentActionPreview = AgentActionPreview,
> {
  readonly definition: AgentActionDefinition<TInput, TResult, TPreview>;
  /** Whether the action is currently invokable. Defaults to always available. */
  readonly isAvailable?: () => boolean;
  /** Action-level revision, when finer-grained than the surface revision. */
  readonly getRevision?: () => number;
}

/**
 * Handle returned by capability registration. `update` swaps the live
 * closures in place (no unregister/re-register churn on React rerenders).
 */
export interface AgentCapabilityRegistration<TUpdate> {
  readonly instanceId: AgentSurfaceInstanceId;
  readonly capabilityId: string;
  update(input: TUpdate): void;
  /** Removes the capability. Idempotent. */
  unregister(): void;
}

/** Deterministic filters for discovery. No semantic search in the MVP. */
export interface AgentDiscoveryQuery {
  readonly faceIds?: readonly AgentFaceId[];
  readonly tags?: readonly string[];
  readonly entityType?: string;
  /** Case-insensitive match over face id/name/description, capability names, and tags. */
  readonly text?: string;
  /**
   * The identities discovery runs as. Discovery returns only capabilities
   * this principal may inspect (`inspect-action`) or read
   * (`read-resource`) — a denied capability's metadata is never returned.
   */
  readonly principals?: PrincipalContext;
}

/** Serialisable resource metadata, without live closures. */
export interface AgentResourceDescriptor {
  readonly id: AgentResourceId;
  readonly name: string;
  readonly description: string;
  readonly sensitivity?: AgentSensitivity;
  readonly tags?: readonly string[];
}

/** The confirmation policy kind declared by an action definition. */
export type AgentConfirmationPolicyKind = "never" | "always" | "conditional";

/** Serialisable action metadata, without live closures. */
export interface AgentActionDescriptor {
  readonly id: AgentActionId;
  readonly name: string;
  readonly description: string;
  readonly sensitivity?: AgentSensitivity;
  readonly tags?: readonly string[];
  readonly confirmationPolicy: AgentConfirmationPolicyKind;
  readonly preconditions: readonly {
    readonly id: string;
    readonly description: string;
  }[];
  readonly inputSchema?: JsonObject;
}

/** One discovered surface with its capability metadata. */
export interface AgentDiscoveredSurface {
  readonly instance: AgentSurfaceInstance;
  readonly resources: readonly AgentResourceDescriptor[];
  readonly actions: readonly AgentActionDescriptor[];
}

/** Result of a discovery query. */
export interface AgentDiscoveryResult {
  readonly surfaces: readonly AgentDiscoveredSurface[];
}

/** A resource in a surface snapshot, including its current read-policy decision. */
export interface AgentResourceSnapshot extends AgentResourceDescriptor {
  readonly revision?: number;
  readonly readDecision: AgentPolicyDecision;
}

/** An action in a surface snapshot, including availability and its inspect-policy decision. */
export interface AgentActionSnapshot extends AgentActionDescriptor {
  readonly available: boolean;
  readonly inspectDecision: AgentPolicyDecision;
}

/** Full inspection of one mounted surface. */
export interface AgentSurfaceSnapshot {
  readonly instance: AgentSurfaceInstance;
  readonly resources: readonly AgentResourceSnapshot[];
  readonly actions: readonly AgentActionSnapshot[];
}

/** Reads one resource's current value. */
export interface ReadResourceRequest {
  readonly instanceId: AgentSurfaceInstanceId;
  readonly resourceId: AgentResourceId;
  /** Overrides the runtime's configured principals for this read. */
  readonly principals?: PrincipalContext;
}

/** A resource read: the JSON-safe value and its revision at read time. */
export interface ReadResourceResult {
  readonly value: JsonValue;
  readonly revision?: number;
}

/** Requests preparation of an action invocation. `input` is untrusted until validated. */
export interface PrepareActionRequest {
  readonly instanceId: AgentSurfaceInstanceId;
  readonly actionId: AgentActionId;
  readonly input: unknown;
  /** Rejects preparation with `STALE_STATE` if the current revision differs. */
  readonly expectedRevision?: number;
  readonly principals?: PrincipalContext;
}

/**
 * A prepared, validated invocation. Confirmation and execution bind to this
 * exact preparation — input, preview, revision, and expiry included.
 */
export interface PreparedAgentAction {
  readonly preparationId: string;
  readonly surfaceInstanceId: AgentSurfaceInstanceId;
  readonly actionId: AgentActionId;
  readonly validatedInput: unknown;
  readonly preview?: AgentActionPreview;
  readonly confirmationRequired: boolean;
  readonly confirmationReason?: string;
  /** The revision the preparation is bound to. */
  readonly expectedRevision?: number;
  /** ISO-8601 expiry after which the preparation is rejected. */
  readonly expiresAt: string;
  readonly traceId: AgentTraceId;
}

/** Confirms one prepared action. */
export interface ConfirmActionRequest {
  readonly preparationId: string;
  readonly principals?: PrincipalContext;
}

/** Acknowledgement that the exact prepared operation was confirmed. */
export interface ConfirmedAgentAction {
  readonly preparationId: string;
  readonly confirmedAt: string;
}

/** Executes one prepared (and, when required, confirmed) action. */
export interface ExecuteActionRequest {
  readonly preparationId: string;
  readonly principals?: PrincipalContext;
}

/** The structured outcome of an execution. */
export interface AgentActionExecutionResult {
  readonly preparationId: string;
  readonly surfaceInstanceId: AgentSurfaceInstanceId;
  readonly actionId: AgentActionId;
  readonly result: AgentActionResult<JsonValue>;
  readonly durationMs: number;
  readonly traceId: AgentTraceId;
}

/**
 * An action currently recommended as a next step: the evaluated, serialisable
 * snapshot of a definition's `recommend` closure. Sorted by priority (higher
 * first) in `getRecommendedActions`.
 */
export interface AgentRecommendedAction {
  readonly instanceId: AgentSurfaceInstanceId;
  readonly actionId: AgentActionId;
  /** The action's human-readable name (button label). */
  readonly name: string;
  /** Why it is recommended right now. */
  readonly reason?: string;
  /** The instruction a UI sends to the assistant to run it. */
  readonly instruction: string;
  readonly priority: number;
}

/** Receives every runtime event as it is emitted. */
export type AgentRuntimeListener = (event: AgentTraceEvent) => void;

/**
 * The AgentFace runtime: the in-memory registry and policy-mediated
 * operating layer for mounted surfaces. All agent operations — discovery,
 * reads, preparation, confirmation, execution — go through this interface;
 * nothing may invoke application closures directly.
 */
export interface AgentRuntime {
  registerSurface(input: RegisterSurfaceInput): AgentSurfaceRegistration;
  unregisterSurface(instanceId: AgentSurfaceInstanceId): void;

  registerResource<TValue>(
    instanceId: AgentSurfaceInstanceId,
    input: RegisterResourceInput<TValue>,
  ): AgentCapabilityRegistration<UpdateResourceInput<TValue>>;

  registerAction<
    TInput,
    TResult extends JsonValue,
    TPreview extends AgentActionPreview = AgentActionPreview,
  >(
    instanceId: AgentSurfaceInstanceId,
    input: RegisterActionInput<TInput, TResult, TPreview>,
  ): AgentCapabilityRegistration<RegisterActionInput<TInput, TResult, TPreview>>;

  discover(query?: AgentDiscoveryQuery): Promise<AgentDiscoveryResult>;
  inspectSurface(
    instanceId: AgentSurfaceInstanceId,
    principals?: PrincipalContext,
  ): Promise<AgentSurfaceSnapshot>;

  readResource(request: ReadResourceRequest): Promise<ReadResourceResult>;

  prepareAction(request: PrepareActionRequest): Promise<PreparedAgentAction>;
  confirmAction(request: ConfirmActionRequest): Promise<ConfirmedAgentAction>;
  executeAction(
    request: ExecuteActionRequest,
  ): Promise<AgentActionExecutionResult>;

  subscribe(listener: AgentRuntimeListener): () => void;
  /** The in-memory trace buffer, oldest first. */
  getTraceEvents(): readonly AgentTraceEvent[];

  /**
   * Evaluates every mounted action's `recommend` condition against current
   * state and returns the ones that hold (and are available), highest
   * priority first. Cheap and synchronous — safe to call on every state
   * change.
   */
  getRecommendedActions(): readonly AgentRecommendedAction[];
}
