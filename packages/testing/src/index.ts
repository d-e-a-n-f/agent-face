/**
 * Deterministic testing helpers for AgentFace: a controllable-clock test
 * runtime, principal factories, and one-call action execution. React render
 * helpers live in the separate `@agentface/testing/react` entry point.
 *
 * Tests built on this package never require a language model.
 *
 * @packageDocumentation
 */

export {
  createTestAgentRuntime,
  createTestAgent,
  createTestPrincipal,
  createTestUser,
  executeTestAction,
  prepareTestAction,
  registerTestSurface,
  TEST_FACE,
} from "./test-runtime.js";
export type {
  CreateTestAgentRuntimeOptions,
  CreateTestPrincipalOptions,
  ExecuteTestActionOptions,
  TestAgentRuntime,
} from "./test-runtime.js";
