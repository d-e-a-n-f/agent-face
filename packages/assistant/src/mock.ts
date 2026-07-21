import type {
  AgentModelAdapter,
  AgentModelRequest,
  AgentModelResponse,
} from "./types.js";

/** One scripted completion for {@link createMockModelAdapter}. */
export type MockScriptStep =
  | AgentModelResponse
  | ((request: AgentModelRequest) => AgentModelResponse);

/**
 * A deterministic model adapter that replays a script of completions in
 * order. Steps may be functions of the request, so scripts can resolve
 * runtime-generated tool names and instance ids at call time. Throws when
 * the script is exhausted — a test that makes more model calls than scripted
 * is a failing test, not an improvising one.
 *
 * This is the only adapter CI ever uses; no real model calls in tests.
 *
 * @example
 * ```ts
 * const adapter = createMockModelAdapter([
 *   (request) => ({
 *     toolCalls: [{
 *       toolCallId: "call_1",
 *       toolName: request.tools.find((t) => t.name.endsWith("__send"))!.name,
 *       input: { message: "hello" },
 *     }],
 *     stopReason: "tool-use",
 *   }),
 *   { text: "Done.", toolCalls: [], stopReason: "end-turn" },
 * ]);
 * ```
 */
export function createMockModelAdapter(
  script: readonly MockScriptStep[],
): AgentModelAdapter {
  let index = 0;
  return {
    complete(request: AgentModelRequest): Promise<AgentModelResponse> {
      const step = script[index];
      if (step === undefined) {
        return Promise.reject(
          new Error(
            `Mock model script exhausted after ${index} completions — the assistant made an unscripted model call`,
          ),
        );
      }
      index += 1;
      return Promise.resolve(typeof step === "function" ? step(request) : step);
    },
  };
}
