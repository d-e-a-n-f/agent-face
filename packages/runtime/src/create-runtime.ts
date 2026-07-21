import type {
  AgentActionPreview,
  AgentConfirmationRule,
  AgentEntityReference,
  AgentPrecondition,
  AgentRuntimeEvent,
  AgentSensitivity,
  AgentSurfaceInstance,
  AgentSurfaceInstanceId,
  AgentTraceEvent,
  AgentTraceId,
  JsonValue,
} from "@agentface/core";
import { AgentFaceError, isAgentError } from "@agentface/core";
import type {
  AgentPolicyDecision,
  AgentPolicyEngine,
  AgentPolicyOperation,
  AgentPolicyRequest,
  PrincipalContext,
} from "@agentface/policy";
import { createPolicyEngine } from "@agentface/policy";
import type {
  AgentActionDescriptor,
  AgentActionExecutionResult,
  AgentRecommendedAction,
  AgentCapabilityRegistration,
  AgentDiscoveredSurface,
  AgentDiscoveryQuery,
  AgentDiscoveryResult,
  AgentResourceDescriptor,
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

/** The runtime's injectable ID kinds. */
export type AgentRuntimeIdKind = "instance" | "preparation" | "trace";

/** Options for {@link createAgentRuntime}. */
export interface CreateAgentRuntimeOptions {
  /** Policy engine consulted for every operation. Defaults to allow-all. */
  readonly policy?: AgentPolicyEngine;
  /** The identities operations run as, unless overridden per request. */
  readonly principals?: PrincipalContext | (() => PrincipalContext);
  /** Injectable clock for deterministic tests. */
  readonly now?: () => Date;
  /** Injectable ID generator for deterministic tests. */
  readonly generateId?: (kind: AgentRuntimeIdKind) => string;
  /** How long a prepared action stays valid. Default 5 minutes. */
  readonly preparationTtlMs?: number;
  /** Maximum retained trace events. Default 1000. */
  readonly traceLimit?: number;
}

interface PreparedInvocation {
  readonly validatedInput: unknown;
  readonly runPreview: (() => Promise<AgentActionPreview>) | undefined;
  readonly evaluateConfirmation: () => ConfirmationOutcome;
  readonly execute: () => Promise<unknown>;
}

interface ConfirmationOutcome {
  readonly required: boolean;
  readonly reason?: string;
}

interface StoredResource {
  descriptor: AgentResourceDescriptor;
  sensitivity: AgentSensitivity | undefined;
  read: () => JsonValue;
  getRevision: (() => number) | undefined;
}

interface EvaluatedRecommendation {
  readonly reason?: string;
  readonly instruction: string;
  readonly priority: number;
}

interface StoredAction {
  descriptor: AgentActionDescriptor;
  sensitivity: AgentSensitivity | undefined;
  preconditions: readonly AgentPrecondition[];
  prepare: (raw: unknown) => PreparedInvocation;
  isAvailable: () => boolean;
  getRevision: (() => number) | undefined;
  /** Evaluates the definition's recommend closure; null when not recommended. */
  evaluateRecommendation: (() => EvaluatedRecommendation | null) | undefined;
}

interface StoredSurface {
  readonly instanceId: AgentSurfaceInstanceId;
  readonly face: RegisterSurfaceInput["face"];
  entity: AgentEntityReference | undefined;
  parentInstanceId: AgentSurfaceInstanceId | undefined;
  readonly childInstanceIds: Set<AgentSurfaceInstanceId>;
  readonly mountedAt: string;
  revision: number;
  readonly resources: Map<string, StoredResource>;
  readonly actions: Map<string, StoredAction>;
}

interface StoredPreparation {
  readonly preparationId: string;
  readonly instanceId: AgentSurfaceInstanceId;
  readonly actionId: string;
  readonly validatedInput: unknown;
  readonly preview: AgentActionPreview | undefined;
  readonly confirmationRequired: boolean;
  readonly confirmationReason: string | undefined;
  readonly boundRevision: number | undefined;
  readonly expiresAt: string;
  readonly expiresAtMs: number;
  readonly execute: () => Promise<unknown>;
  readonly traceId: AgentTraceId;
  confirmed: boolean;
}

function evaluateConfirmationRule<TInput>(
  rule: AgentConfirmationRule<TInput> | undefined,
  input: TInput,
): ConfirmationOutcome {
  if (rule === undefined || rule === "never") {
    return { required: false };
  }
  if (rule === "always") {
    return {
      required: true,
      reason: "This action always requires confirmation",
    };
  }
  if (rule.evaluate(input)) {
    return {
      required: true,
      reason: rule.reason ?? "Confirmation required by the action's rule",
    };
  }
  return { required: false };
}

function error(
  code: AgentFaceError["code"],
  message: string,
  details?: JsonValue,
): AgentFaceError {
  return new AgentFaceError({
    code,
    message,
    ...(details !== undefined ? { details } : {}),
  });
}

/**
 * Creates an in-memory AgentFace runtime.
 *
 * Every agent operation is policy-mediated and follows the enforced action
 * lifecycle: locate → validate → availability → preconditions → revision →
 * policy → preview → confirmation → execute → trace. Application execution
 * closures stay inside the runtime and are never serialised.
 *
 * @example
 * ```ts
 * const runtime = createAgentRuntime({ policy });
 * const surface = runtime.registerSurface({ face: invoiceFace, entity });
 * runtime.registerAction(surface.instanceId, { definition: sendAction });
 * const prepared = await runtime.prepareAction({
 *   instanceId: surface.instanceId,
 *   actionId: "send",
 *   input: { message: "Please find the invoice attached." },
 * });
 * ```
 */
export function createAgentRuntime(
  options: CreateAgentRuntimeOptions = {},
): AgentRuntime {
  const policy = options.policy ?? createPolicyEngine([]);
  const now = options.now ?? (() => new Date());
  const preparationTtlMs = options.preparationTtlMs ?? 5 * 60_000;
  const traceLimit = options.traceLimit ?? 1000;

  const counters: Record<AgentRuntimeIdKind, number> = {
    instance: 0,
    preparation: 0,
    trace: 0,
  };
  const generateId =
    options.generateId ?? ((kind: AgentRuntimeIdKind) => `${kind}_${++counters[kind]}`);

  const surfaces = new Map<AgentSurfaceInstanceId, StoredSurface>();
  const preparations = new Map<string, StoredPreparation>();
  const listeners = new Set<AgentRuntimeListener>();
  const traceEvents: AgentTraceEvent[] = [];

  function resolvePrincipals(override?: PrincipalContext): PrincipalContext {
    if (override !== undefined) {
      return override;
    }
    const configured = options.principals;
    if (typeof configured === "function") {
      return configured();
    }
    return configured ?? {};
  }

  function emit(traceId: AgentTraceId, event: AgentRuntimeEvent): void {
    const traced: AgentTraceEvent = {
      ...event,
      traceId,
      timestamp: now().toISOString(),
    };
    traceEvents.push(traced);
    if (traceEvents.length > traceLimit) {
      traceEvents.splice(0, traceEvents.length - traceLimit);
    }
    for (const listener of listeners) {
      try {
        listener(traced);
      } catch {
        // Listener failures must never break runtime operations.
      }
    }
  }

  function mustGetSurface(instanceId: AgentSurfaceInstanceId): StoredSurface {
    const surface = surfaces.get(instanceId);
    if (surface === undefined) {
      throw error(
        "SURFACE_NOT_FOUND",
        `No mounted surface with instance id "${instanceId}"`,
      );
    }
    return surface;
  }

  function snapshotInstance(surface: StoredSurface): AgentSurfaceInstance {
    return {
      instanceId: surface.instanceId,
      face: surface.face,
      ...(surface.entity !== undefined ? { entity: surface.entity } : {}),
      ...(surface.parentInstanceId !== undefined
        ? { parentInstanceId: surface.parentInstanceId }
        : {}),
      childInstanceIds: [...surface.childInstanceIds],
      mountedAt: surface.mountedAt,
      revision: surface.revision,
    };
  }

  async function evaluatePolicy(
    operation: AgentPolicyOperation,
    surface: StoredSurface,
    traceId: AgentTraceId,
    context: {
      readonly principals?: PrincipalContext;
      readonly resourceId?: string;
      readonly actionId?: string;
      readonly sensitivity?: AgentSensitivity;
      readonly input?: unknown;
    } = {},
  ): Promise<AgentPolicyDecision> {
    const principals = resolvePrincipals(context.principals);
    const request: AgentPolicyRequest = {
      operation,
      ...(principals.user !== undefined ? { user: principals.user } : {}),
      ...(principals.agent !== undefined ? { agent: principals.agent } : {}),
      ...(principals.delegation !== undefined
        ? { delegation: principals.delegation }
        : {}),
      surface: {
        faceId: surface.face.id,
        instanceId: surface.instanceId,
        ...(surface.entity !== undefined ? { entity: surface.entity } : {}),
      },
      ...(context.resourceId !== undefined
        ? { resourceId: context.resourceId }
        : {}),
      ...(context.actionId !== undefined ? { actionId: context.actionId } : {}),
      ...(context.sensitivity !== undefined
        ? { sensitivity: context.sensitivity }
        : {}),
      ...(context.input !== undefined ? { input: context.input } : {}),
    };
    const decision = await policy.evaluate(request);
    emit(traceId, {
      type: "policy.decided",
      operation,
      effect: decision.effect,
      instanceId: surface.instanceId,
      ...(decision.effect !== "allow" ? { reason: decision.reason } : {}),
    });
    return decision;
  }

  function currentRevision(
    surface: StoredSurface,
    action: StoredAction,
  ): number {
    return action.getRevision?.() ?? surface.revision;
  }

  function actionFailure(
    traceId: AgentTraceId,
    instanceId: AgentSurfaceInstanceId,
    actionId: string,
    failure: AgentFaceError,
    preparationId?: string,
  ): AgentFaceError {
    emit(traceId, {
      type: "action.failed",
      instanceId,
      actionId,
      ...(preparationId !== undefined ? { preparationId } : {}),
      error: failure.toJSON(),
    });
    return failure;
  }

  function removePreparationsFor(
    instanceId: AgentSurfaceInstanceId,
    actionId?: string,
  ): void {
    for (const [id, preparation] of preparations) {
      if (
        preparation.instanceId === instanceId &&
        (actionId === undefined || preparation.actionId === actionId)
      ) {
        preparations.delete(id);
      }
    }
  }

  function registerSurface(
    input: RegisterSurfaceInput,
  ): AgentSurfaceRegistration {
    if (input.parentInstanceId !== undefined) {
      mustGetSurface(input.parentInstanceId);
    }
    const instanceId = `${input.face.id}:${input.entity?.id ?? "-"}:${generateId("instance")}`;
    const surface: StoredSurface = {
      instanceId,
      face: input.face,
      entity: input.entity,
      parentInstanceId: input.parentInstanceId,
      childInstanceIds: new Set(),
      mountedAt: now().toISOString(),
      revision: 0,
      resources: new Map(),
      actions: new Map(),
    };
    surfaces.set(instanceId, surface);
    if (input.parentInstanceId !== undefined) {
      surfaces.get(input.parentInstanceId)?.childInstanceIds.add(instanceId);
    }
    emit(generateId("trace"), {
      type: "surface.registered",
      surface: snapshotInstance(surface),
    });
    return {
      instanceId,
      setEntity(entity) {
        surface.entity = entity;
      },
      bumpRevision() {
        surface.revision += 1;
        return surface.revision;
      },
      unregister() {
        unregisterSurface(instanceId);
      },
    };
  }

  function unregisterSurface(instanceId: AgentSurfaceInstanceId): void {
    const surface = surfaces.get(instanceId);
    if (surface === undefined) {
      return;
    }
    if (surface.parentInstanceId !== undefined) {
      surfaces.get(surface.parentInstanceId)?.childInstanceIds.delete(instanceId);
    }
    for (const childId of surface.childInstanceIds) {
      const child = surfaces.get(childId);
      if (child !== undefined) {
        child.parentInstanceId = undefined;
      }
    }
    removePreparationsFor(instanceId);
    surfaces.delete(instanceId);
    emit(generateId("trace"), {
      type: "surface.unregistered",
      instanceId,
      faceId: surface.face.id,
    });
  }

  function registerResource<TValue>(
    instanceId: AgentSurfaceInstanceId,
    input: RegisterResourceInput<TValue>,
  ): AgentCapabilityRegistration<UpdateResourceInput<TValue>> {
    const surface = mustGetSurface(instanceId);
    const definition = input.definition;
    if (surface.resources.has(definition.id)) {
      throw error(
        "INVALID_INPUT",
        `Resource "${definition.id}" is already registered on surface "${instanceId}"`,
      );
    }
    // Pairs the getter with the definition's serialize inside one closure so
    // the TValue relationship is preserved without erased casts. Resources
    // without serialize must return JSON-safe values — that contract is the
    // one place the value is asserted rather than proven.
    const makeRead = (getValue: () => TValue) => (): JsonValue => {
      const value = getValue();
      return definition.serialize !== undefined
        ? definition.serialize(value)
        : (value as JsonValue);
    };
    const stored: StoredResource = {
      descriptor: {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        ...(definition.sensitivity !== undefined
          ? { sensitivity: definition.sensitivity }
          : {}),
        ...(definition.tags !== undefined ? { tags: definition.tags } : {}),
      },
      sensitivity: definition.sensitivity,
      read: makeRead(input.getValue),
      getRevision: input.getRevision,
    };
    surface.resources.set(definition.id, stored);
    return {
      instanceId,
      capabilityId: definition.id,
      update(next) {
        stored.read = makeRead(next.getValue);
        stored.getRevision = next.getRevision;
      },
      unregister() {
        surface.resources.delete(definition.id);
      },
    };
  }

  function registerAction<
    TInput,
    TResult,
    TPreview extends AgentActionPreview,
  >(
    instanceId: AgentSurfaceInstanceId,
    input: RegisterActionInput<TInput, TResult, TPreview>,
  ): AgentCapabilityRegistration<RegisterActionInput<TInput, TResult, TPreview>> {
    const surface = mustGetSurface(instanceId);
    const actionId = input.definition.id;
    if (surface.actions.has(actionId)) {
      throw error(
        "INVALID_INPUT",
        `Action "${actionId}" is already registered on surface "${instanceId}"`,
      );
    }

    // All TInput/TResult pairing lives inside this closure: the runtime only
    // ever executes with the exact value produced by this definition's parse.
    const build = (
      registration: RegisterActionInput<TInput, TResult, TPreview>,
    ): Omit<StoredAction, "descriptor"> & {
      descriptor: AgentActionDescriptor;
    } => {
      const definition = registration.definition;
      const preview = definition.preview;
      const confirmationPolicy =
        definition.confirmation === undefined || definition.confirmation === "never"
          ? "never"
          : definition.confirmation === "always"
            ? "always"
            : "conditional";
      const inputSchema = definition.input.toJSONSchema?.();
      return {
        descriptor: {
          id: definition.id,
          name: definition.name,
          description: definition.description,
          ...(definition.sensitivity !== undefined
            ? { sensitivity: definition.sensitivity }
            : {}),
          ...(definition.tags !== undefined ? { tags: definition.tags } : {}),
          confirmationPolicy,
          preconditions: (definition.preconditions ?? []).map(
            (precondition) => ({
              id: precondition.id,
              description: precondition.description,
            }),
          ),
          ...(inputSchema !== undefined ? { inputSchema } : {}),
        },
        sensitivity: definition.sensitivity,
        preconditions: definition.preconditions ?? [],
        prepare(raw: unknown): PreparedInvocation {
          const validated = definition.input.parse(raw);
          return {
            validatedInput: validated,
            runPreview:
              preview !== undefined
                ? async () => await preview(validated)
                : undefined,
            evaluateConfirmation: () =>
              evaluateConfirmationRule(definition.confirmation, validated),
            execute: async () => await definition.execute(validated),
          };
        },
        isAvailable: registration.isAvailable ?? (() => true),
        getRevision: registration.getRevision,
        evaluateRecommendation:
          definition.recommend === undefined
            ? undefined
            : () => {
                const recommend = definition.recommend;
                if (recommend === undefined || !recommend.when()) {
                  return null;
                }
                const instruction =
                  typeof recommend.instruction === "function"
                    ? recommend.instruction()
                    : (recommend.instruction ?? definition.name);
                return {
                  ...(recommend.reason !== undefined
                    ? { reason: recommend.reason }
                    : {}),
                  instruction,
                  priority: recommend.priority ?? 0,
                };
              },
      };
    };

    const stored: StoredAction = build(input);
    surface.actions.set(actionId, stored);
    return {
      instanceId,
      capabilityId: actionId,
      update(next) {
        if (next.definition.id !== actionId) {
          throw error(
            "INVALID_INPUT",
            `Cannot update action "${actionId}" with a definition for "${next.definition.id}"`,
          );
        }
        const rebuilt = build(next);
        stored.descriptor = rebuilt.descriptor;
        stored.sensitivity = rebuilt.sensitivity;
        stored.preconditions = rebuilt.preconditions;
        stored.prepare = rebuilt.prepare;
        stored.isAvailable = rebuilt.isAvailable;
        stored.getRevision = rebuilt.getRevision;
      },
      unregister() {
        surface.actions.delete(actionId);
        removePreparationsFor(instanceId, actionId);
      },
    };
  }

  async function discover(
    query: AgentDiscoveryQuery = {},
  ): Promise<AgentDiscoveryResult> {
    const results: AgentDiscoveredSurface[] = [];
    for (const surface of surfaces.values()) {
      const decision = await evaluatePolicy(
        "discover",
        surface,
        generateId("trace"),
      );
      if (decision.effect === "deny") {
        continue;
      }
      if (!matchesQuery(surface, query)) {
        continue;
      }
      results.push({
        instance: snapshotInstance(surface),
        resources: [...surface.resources.values()].map(
          (resource) => resource.descriptor,
        ),
        actions: [...surface.actions.values()].map(
          (action) => action.descriptor,
        ),
      });
    }
    return { surfaces: results };
  }

  function matchesQuery(
    surface: StoredSurface,
    query: AgentDiscoveryQuery,
  ): boolean {
    if (query.faceIds !== undefined && !query.faceIds.includes(surface.face.id)) {
      return false;
    }
    if (
      query.entityType !== undefined &&
      surface.entity?.type !== query.entityType
    ) {
      return false;
    }
    if (query.tags !== undefined && query.tags.length > 0) {
      const surfaceTags = new Set([
        ...(surface.face.tags ?? []),
        ...[...surface.resources.values()].flatMap(
          (resource) => resource.descriptor.tags ?? [],
        ),
        ...[...surface.actions.values()].flatMap(
          (action) => action.descriptor.tags ?? [],
        ),
      ]);
      if (!query.tags.some((tag) => surfaceTags.has(tag))) {
        return false;
      }
    }
    if (query.text !== undefined && query.text.trim().length > 0) {
      const needle = query.text.trim().toLowerCase();
      const haystack = [
        surface.face.id,
        surface.face.name,
        surface.face.description,
        ...(surface.face.tags ?? []),
        ...[...surface.resources.values()].flatMap((resource) => [
          resource.descriptor.id,
          resource.descriptor.name,
          ...(resource.descriptor.tags ?? []),
        ]),
        ...[...surface.actions.values()].flatMap((action) => [
          action.descriptor.id,
          action.descriptor.name,
          ...(action.descriptor.tags ?? []),
        ]),
      ]
        .join("\n")
        .toLowerCase();
      if (!haystack.includes(needle)) {
        return false;
      }
    }
    return true;
  }

  async function inspectSurface(
    instanceId: AgentSurfaceInstanceId,
    principals?: PrincipalContext,
  ): Promise<AgentSurfaceSnapshot> {
    const surface = mustGetSurface(instanceId);
    const traceId = generateId("trace");
    const resources = [];
    for (const resource of surface.resources.values()) {
      const readDecision = await evaluatePolicy("read-resource", surface, traceId, {
        ...(principals !== undefined ? { principals } : {}),
        resourceId: resource.descriptor.id,
        ...(resource.sensitivity !== undefined
          ? { sensitivity: resource.sensitivity }
          : {}),
      });
      const revision = resource.getRevision?.();
      resources.push({
        ...resource.descriptor,
        ...(revision !== undefined ? { revision } : {}),
        readDecision,
      });
    }
    const actions = [];
    for (const action of surface.actions.values()) {
      const inspectDecision = await evaluatePolicy(
        "inspect-action",
        surface,
        traceId,
        {
          ...(principals !== undefined ? { principals } : {}),
          actionId: action.descriptor.id,
          ...(action.sensitivity !== undefined
            ? { sensitivity: action.sensitivity }
            : {}),
        },
      );
      actions.push({
        ...action.descriptor,
        available: action.isAvailable(),
        inspectDecision,
      });
    }
    return { instance: snapshotInstance(surface), resources, actions };
  }

  async function readResource(
    request: ReadResourceRequest,
  ): Promise<ReadResourceResult> {
    const surface = mustGetSurface(request.instanceId);
    const resource = surface.resources.get(request.resourceId);
    if (resource === undefined) {
      throw error(
        "RESOURCE_NOT_FOUND",
        `No resource "${request.resourceId}" on surface "${request.instanceId}"`,
      );
    }
    const traceId = generateId("trace");
    const decision = await evaluatePolicy("read-resource", surface, traceId, {
      ...(request.principals !== undefined
        ? { principals: request.principals }
        : {}),
      resourceId: request.resourceId,
      ...(resource.sensitivity !== undefined
        ? { sensitivity: resource.sensitivity }
        : {}),
    });
    if (decision.effect === "deny") {
      throw error("POLICY_DENIED", decision.reason, {
        ...(decision.code !== undefined ? { code: decision.code } : {}),
      });
    }
    const value = resource.read();
    const revision = resource.getRevision?.() ?? surface.revision;
    emit(traceId, {
      type: "resource.read",
      instanceId: request.instanceId,
      resourceId: request.resourceId,
      revision,
    });
    return { value, revision };
  }

  async function prepareAction(
    request: PrepareActionRequest,
  ): Promise<PreparedAgentAction> {
    // Lifecycle order is contractual: locate surface, locate action, inspect
    // policy, validate, availability, preconditions, revision, execute
    // policy, preview, confirmation.
    const surface = mustGetSurface(request.instanceId);
    const action = surface.actions.get(request.actionId);
    if (action === undefined) {
      throw error(
        "ACTION_NOT_FOUND",
        `No action "${request.actionId}" on surface "${request.instanceId}"`,
      );
    }
    const traceId = generateId("trace");
    emit(traceId, {
      type: "action.preparing",
      instanceId: request.instanceId,
      actionId: request.actionId,
    });

    const fail = (failure: AgentFaceError): never => {
      throw actionFailure(
        traceId,
        request.instanceId,
        request.actionId,
        failure,
      );
    };

    const principalsContext =
      request.principals !== undefined
        ? { principals: request.principals }
        : {};
    const sensitivityContext =
      action.sensitivity !== undefined
        ? { sensitivity: action.sensitivity }
        : {};

    const inspectDecision = await evaluatePolicy(
      "inspect-action",
      surface,
      traceId,
      {
        ...principalsContext,
        actionId: request.actionId,
        ...sensitivityContext,
      },
    );
    if (inspectDecision.effect === "deny") {
      fail(
        error("POLICY_DENIED", inspectDecision.reason, {
          ...(inspectDecision.code !== undefined
            ? { code: inspectDecision.code }
            : {}),
        }),
      );
    }

    let invocation: PreparedInvocation;
    try {
      invocation = action.prepare(request.input);
    } catch (caught) {
      if (caught instanceof AgentFaceError) {
        fail(caught);
      }
      fail(
        error("INVALID_INPUT", "Input validation failed", {
          message: caught instanceof Error ? caught.message : String(caught),
        }),
      );
      throw caught; // unreachable; satisfies definite assignment
    }

    if (!action.isAvailable()) {
      fail(
        error(
          "PRECONDITION_FAILED",
          `Action "${request.actionId}" is not currently available`,
          { kind: "availability" },
        ),
      );
    }

    for (const precondition of action.preconditions) {
      const holds = await precondition.check();
      if (!holds) {
        fail(
          error("PRECONDITION_FAILED", precondition.description, {
            preconditionId: precondition.id,
          }),
        );
      }
    }

    const revision = currentRevision(surface, action);
    if (
      request.expectedRevision !== undefined &&
      request.expectedRevision !== revision
    ) {
      fail(
        error(
          "STALE_STATE",
          `Expected revision ${request.expectedRevision} but the current revision is ${revision}`,
          { expected: request.expectedRevision, current: revision },
        ),
      );
    }

    const executeDecision = await evaluatePolicy(
      "execute-action",
      surface,
      traceId,
      {
        ...principalsContext,
        actionId: request.actionId,
        ...sensitivityContext,
        input: invocation.validatedInput,
      },
    );
    if (executeDecision.effect === "deny") {
      fail(
        error("POLICY_DENIED", executeDecision.reason, {
          ...(executeDecision.code !== undefined
            ? { code: executeDecision.code }
            : {}),
        }),
      );
    }

    const preview =
      invocation.runPreview !== undefined
        ? await invocation.runPreview()
        : undefined;

    const definitionConfirmation = invocation.evaluateConfirmation();
    const confirmationRequired =
      executeDecision.effect === "confirm" || definitionConfirmation.required;
    const confirmationReason =
      executeDecision.effect === "confirm"
        ? executeDecision.reason
        : definitionConfirmation.reason;

    const preparationId = generateId("preparation");
    const nowMs = now().getTime();
    const expiresAtMs = nowMs + preparationTtlMs;
    const preparation: StoredPreparation = {
      preparationId,
      instanceId: request.instanceId,
      actionId: request.actionId,
      validatedInput: invocation.validatedInput,
      preview,
      confirmationRequired,
      confirmationReason: confirmationRequired ? confirmationReason : undefined,
      boundRevision: revision,
      expiresAt: new Date(expiresAtMs).toISOString(),
      expiresAtMs,
      execute: invocation.execute,
      traceId,
      confirmed: false,
    };
    preparations.set(preparationId, preparation);

    emit(traceId, {
      type: "action.prepared",
      instanceId: request.instanceId,
      actionId: request.actionId,
      preparationId,
      confirmationRequired,
    });
    if (confirmationRequired) {
      emit(traceId, {
        type: "action.confirmation-required",
        instanceId: request.instanceId,
        actionId: request.actionId,
        preparationId,
        ...(preparation.confirmationReason !== undefined
          ? { reason: preparation.confirmationReason }
          : {}),
      });
    }

    return {
      preparationId,
      surfaceInstanceId: request.instanceId,
      actionId: request.actionId,
      validatedInput: invocation.validatedInput,
      ...(preview !== undefined ? { preview } : {}),
      confirmationRequired,
      ...(preparation.confirmationReason !== undefined
        ? { confirmationReason: preparation.confirmationReason }
        : {}),
      expectedRevision: revision,
      expiresAt: preparation.expiresAt,
      traceId,
    };
  }

  function mustGetPreparation(preparationId: string): StoredPreparation {
    const preparation = preparations.get(preparationId);
    if (preparation === undefined) {
      throw error(
        "ACTION_NOT_FOUND",
        `No prepared action "${preparationId}" — it may have expired, executed, or been invalidated`,
        { kind: "preparation" },
      );
    }
    return preparation;
  }

  function checkPreparationFreshness(preparation: StoredPreparation): void {
    if (now().getTime() > preparation.expiresAtMs) {
      preparations.delete(preparation.preparationId);
      throw error(
        "CONFIRMATION_REQUIRED",
        `Preparation "${preparation.preparationId}" has expired — prepare the action again`,
        { expired: true },
      );
    }
    const surface = surfaces.get(preparation.instanceId);
    const action = surface?.actions.get(preparation.actionId);
    if (surface === undefined || action === undefined) {
      preparations.delete(preparation.preparationId);
      throw error(
        "ACTION_NOT_FOUND",
        `The surface or action behind preparation "${preparation.preparationId}" is no longer mounted`,
        { kind: "preparation" },
      );
    }
    const revision = currentRevision(surface, action);
    if (
      preparation.boundRevision !== undefined &&
      preparation.boundRevision !== revision
    ) {
      preparations.delete(preparation.preparationId);
      throw error(
        "STALE_STATE",
        `State changed since preparation (revision ${revision}, prepared against ${preparation.boundRevision}) — prepare the action again`,
        { expected: preparation.boundRevision, current: revision },
      );
    }
  }

  async function confirmAction(
    request: ConfirmActionRequest,
  ): Promise<ConfirmedAgentAction> {
    const preparation = mustGetPreparation(request.preparationId);
    checkPreparationFreshness(preparation);
    preparation.confirmed = true;
    emit(preparation.traceId, {
      type: "action.confirmed",
      instanceId: preparation.instanceId,
      actionId: preparation.actionId,
      preparationId: preparation.preparationId,
    });
    return {
      preparationId: preparation.preparationId,
      confirmedAt: now().toISOString(),
    };
  }

  async function executeAction(
    request: ExecuteActionRequest,
  ): Promise<AgentActionExecutionResult> {
    const preparation = mustGetPreparation(request.preparationId);
    if (preparation.confirmationRequired && !preparation.confirmed) {
      throw actionFailure(
        preparation.traceId,
        preparation.instanceId,
        preparation.actionId,
        error(
          "CONFIRMATION_REQUIRED",
          preparation.confirmationReason ??
            "This prepared action requires confirmation before execution",
        ),
        preparation.preparationId,
      );
    }
    checkPreparationFreshness(preparation);

    emit(preparation.traceId, {
      type: "action.executing",
      instanceId: preparation.instanceId,
      actionId: preparation.actionId,
      preparationId: preparation.preparationId,
    });

    const startedAtMs = now().getTime();
    preparations.delete(preparation.preparationId);
    try {
      const value = await preparation.execute();
      const durationMs = now().getTime() - startedAtMs;
      emit(preparation.traceId, {
        type: "action.succeeded",
        instanceId: preparation.instanceId,
        actionId: preparation.actionId,
        preparationId: preparation.preparationId,
        durationMs,
      });
      return {
        preparationId: preparation.preparationId,
        surfaceInstanceId: preparation.instanceId,
        actionId: preparation.actionId,
        // Contract: action results must be JSON-safe to reach agents.
        result: { status: "succeeded", result: value as JsonValue },
        durationMs,
        traceId: preparation.traceId,
      };
    } catch (caught) {
      const durationMs = now().getTime() - startedAtMs;
      const failure = isAgentError(caught)
        ? caught
        : error("EXECUTION_FAILED",
            caught instanceof Error ? caught.message : "Action execution failed",
          ).toJSON();
      const failureError = {
        code: failure.code,
        message: failure.message,
        ...(failure.details !== undefined ? { details: failure.details } : {}),
        ...(failure.retryable !== undefined
          ? { retryable: failure.retryable }
          : {}),
      };
      emit(preparation.traceId, {
        type: "action.failed",
        instanceId: preparation.instanceId,
        actionId: preparation.actionId,
        preparationId: preparation.preparationId,
        error: failureError,
      });
      return {
        preparationId: preparation.preparationId,
        surfaceInstanceId: preparation.instanceId,
        actionId: preparation.actionId,
        result: { status: "failed", error: failureError },
        durationMs,
        traceId: preparation.traceId,
      };
    }
  }

  function getRecommendedActions(): readonly AgentRecommendedAction[] {
    const recommendations: AgentRecommendedAction[] = [];
    for (const surface of surfaces.values()) {
      for (const action of surface.actions.values()) {
        if (action.evaluateRecommendation === undefined) {
          continue;
        }
        try {
          if (!action.isAvailable()) {
            continue;
          }
          const evaluated = action.evaluateRecommendation();
          if (evaluated !== null) {
            recommendations.push({
              instanceId: surface.instanceId,
              actionId: action.descriptor.id,
              name: action.descriptor.name,
              ...evaluated,
            });
          }
        } catch {
          // A throwing closure means "not recommended", never a crash.
        }
      }
    }
    return recommendations.sort(
      (a, b) => b.priority - a.priority || a.name.localeCompare(b.name),
    );
  }

  return {
    registerSurface,
    unregisterSurface,
    registerResource,
    registerAction,
    discover,
    inspectSurface,
    readResource,
    prepareAction,
    confirmAction,
    executeAction,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getTraceEvents() {
      return [...traceEvents];
    },
    getRecommendedActions,
  };
}
