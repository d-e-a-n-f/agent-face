/**
 * Next.js integration for AgentFace. Currently ships the assistant model
 * endpoint as a drop-in route handler; server-defined faces and session
 * manifests come later.
 *
 * Provider-neutral: you supply the model adapter. The handler uses only the
 * web-standard `Request`/`Response`, so it also works in any framework that
 * speaks those — and the underlying `createModelEndpoint` from
 * `@agentface/assistant` is fully framework-neutral for everything else
 * (NestJS, Express, …).
 *
 * @packageDocumentation
 */

import type { ModelAdapterSource } from "@agentface/assistant";
import { createModelEndpoint } from "@agentface/assistant";

/** Options for {@link createAgentFaceRouteHandler}. */
export interface CreateAgentFaceRouteHandlerOptions {
  /**
   * The model adapter, or a lazy (possibly async) factory for one. Factory
   * errors surface as 503 responses with the error message, so configuration
   * problems are diagnosable from the client instead of crashing the server.
   */
  readonly adapter: ModelAdapterSource;
}

/** The route handlers returned by {@link createAgentFaceRouteHandler}. */
export interface AgentFaceRouteHandler {
  POST(request: Request): Promise<Response>;
}

/**
 * Creates the assistant model endpoint as a Next.js App Router route
 * handler. Mount it at `/api/agentface` (the client adapter's default) —
 * mounting it elsewhere just means passing `endpoint` to the client widget
 * or hook.
 *
 * @example
 * ```ts
 * // app/api/agentface/route.ts — e.g. Claude via AWS Bedrock:
 * import { createAgentFaceRouteHandler } from "@agentface/next";
 *
 * export const { POST } = createAgentFaceRouteHandler({
 *   adapter: async () => {
 *     const { createBedrockAdapter } = await import("@agentface/assistant/bedrock");
 *     return createBedrockAdapter();
 *   },
 * });
 * ```
 */
export function createAgentFaceRouteHandler(
  options: CreateAgentFaceRouteHandlerOptions,
): AgentFaceRouteHandler {
  const endpoint = createModelEndpoint(options.adapter);
  return {
    async POST(request: Request): Promise<Response> {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json(
          { error: "Body must be valid JSON" },
          { status: 400 },
        );
      }
      const result = await endpoint.handle(body);
      return Response.json(result.body, { status: result.status });
    },
  };
}
