import type {
  AgentPrincipal,
  DelegationContext,
  UserPrincipal,
} from "@agentface/core";
import type { AgentPolicyEngine, PrincipalContext } from "@agentface/policy";
import { createPolicyEngine, denyAll } from "@agentface/policy";
import type {
  AgentActionExecutionResult,
  AgentRuntime,
  AgentSurfaceRegistration,
  PrepareActionRequest,
  PreparedAgentAction,
  RegisterSurfaceInput,
} from "@agentface/runtime";
import { createAgentRuntime } from "@agentface/runtime";
import { defineAgentFace } from "@agentface/core";

/** Options for {@link createTestAgentRuntime}. */
export interface CreateTestAgentRuntimeOptions {
  /** `"allow-all"` (default), `"deny-all"`, or a custom engine. */
  readonly policy?: "allow-all" | "deny-all" | AgentPolicyEngine;
  readonly principals?: PrincipalContext | (() => PrincipalContext);
  /** ISO-8601 start of the deterministic clock. Default `2026-01-01T00:00:00.000Z`. */
  readonly startTime?: string;
  /** How long prepared actions stay valid. Default 5 minutes. */
  readonly preparationTtlMs?: number;
}

/** An {@link AgentRuntime} with a controllable deterministic clock. */
export interface TestAgentRuntime extends AgentRuntime {
  /** Advances the deterministic clock, e.g. to expire preparations. */
  advanceTime(ms: number): void;
  /** The clock's current time. */
  now(): Date;
}

/**
 * Creates a fully deterministic runtime for tests: fixed controllable clock,
 * sequential IDs, allow-all policy unless configured otherwise. No model, no
 * browser, no wall clock.
 *
 * @example
 * ```ts
 * const runtime = createTestAgentRuntime();
 * const surface = registerTestSurface(runtime);
 * const result = await executeTestAction(runtime, {
 *   instanceId: surface.instanceId,
 *   actionId: "send",
 *   input: { message: "hello" },
 * });
 * ```
 */
export function createTestAgentRuntime(
  options: CreateTestAgentRuntimeOptions = {},
): TestAgentRuntime {
  let nowMs = Date.parse(options.startTime ?? "2026-01-01T00:00:00.000Z");
  const policy =
    options.policy === undefined || options.policy === "allow-all"
      ? createPolicyEngine([])
      : options.policy === "deny-all"
        ? createPolicyEngine([denyAll()])
        : options.policy;
  const runtime = createAgentRuntime({
    policy,
    ...(options.principals !== undefined
      ? { principals: options.principals }
      : {}),
    ...(options.preparationTtlMs !== undefined
      ? { preparationTtlMs: options.preparationTtlMs }
      : {}),
    now: () => new Date(nowMs),
  });
  return {
    ...runtime,
    advanceTime(ms: number): void {
      nowMs += ms;
    },
    now: () => new Date(nowMs),
  };
}

/** Options for {@link createTestPrincipal}. */
export interface CreateTestPrincipalOptions {
  readonly user?: Omit<Partial<UserPrincipal>, "type">;
  readonly agent?: Omit<Partial<AgentPrincipal>, "type">;
  readonly delegation?: Partial<DelegationContext>;
  /** Omit the agent (and delegation), e.g. for human-only flows. */
  readonly agentless?: boolean;
}

/** A deterministic test user. */
export function createTestUser(
  overrides: Omit<Partial<UserPrincipal>, "type"> = {},
): UserPrincipal {
  return {
    type: "user",
    id: "user_test",
    displayName: "Test User",
    ...overrides,
  };
}

/** A deterministic test agent. */
export function createTestAgent(
  overrides: Omit<Partial<AgentPrincipal>, "type"> = {},
): AgentPrincipal {
  return {
    type: "agent",
    id: "agent_test",
    displayName: "Test Agent",
    model: "mock",
    ...overrides,
  };
}

/**
 * A complete deterministic principal context: user, agent, and a valid
 * delegation linking them.
 */
export function createTestPrincipal(
  options: CreateTestPrincipalOptions = {},
): PrincipalContext {
  const user = createTestUser(options.user);
  if (options.agentless === true) {
    return { user };
  }
  const agent = createTestAgent(options.agent);
  const delegation: DelegationContext = {
    userId: user.id,
    agentId: agent.id,
    grantedAt: "2026-01-01T00:00:00.000Z",
    ...options.delegation,
  };
  return { user, agent, delegation };
}

/** The default face used by {@link registerTestSurface}. */
export const TEST_FACE = defineAgentFace({
  id: "test.surface",
  name: "Test surface",
  description: "A surface registered by @agentface/testing",
  version: "0.0.0",
});

/**
 * Registers a surface with sensible test defaults. Register resources and
 * actions on the returned `instanceId` with the runtime's own generic
 * methods, which preserve their input/result types.
 */
export function registerTestSurface(
  runtime: AgentRuntime,
  input: Partial<RegisterSurfaceInput> = {},
): AgentSurfaceRegistration {
  return runtime.registerSurface({
    face: input.face ?? TEST_FACE,
    ...(input.entity !== undefined ? { entity: input.entity } : {}),
    ...(input.parentInstanceId !== undefined
      ? { parentInstanceId: input.parentInstanceId }
      : {}),
  });
}

/** Prepares an action. Thin alias of `runtime.prepareAction` for test readability. */
export async function prepareTestAction(
  runtime: AgentRuntime,
  request: PrepareActionRequest,
): Promise<PreparedAgentAction> {
  return runtime.prepareAction(request);
}

/** Options for {@link executeTestAction}. */
export interface ExecuteTestActionOptions {
  /** Confirm automatically when the preparation requires it. Default true. */
  readonly autoConfirm?: boolean;
}

/**
 * Prepares, (auto-)confirms, and executes an action in one call — the
 * common happy-path shape for contract tests. Set `autoConfirm: false` to
 * assert on confirmation behaviour instead.
 */
export async function executeTestAction(
  runtime: AgentRuntime,
  request: PrepareActionRequest,
  options: ExecuteTestActionOptions = {},
): Promise<AgentActionExecutionResult> {
  const prepared = await runtime.prepareAction(request);
  if (prepared.confirmationRequired && options.autoConfirm !== false) {
    await runtime.confirmAction({ preparationId: prepared.preparationId });
  }
  return runtime.executeAction({ preparationId: prepared.preparationId });
}
