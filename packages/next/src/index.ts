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
 * ⚠️ **The endpoint is a model proxy.** Anyone who can POST to it consumes
 * your model provider account. Production deployments MUST authenticate it
 * (`authorize`) and should rate-limit it (`rateLimit`) — the handler ships
 * with a request-size cap but cannot know your auth scheme.
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
  /**
   * Authenticates the request before anything is parsed. Return `null` to
   * allow, or a `Response` (e.g. 401/403) to reject. **Production
   * deployments must provide this** — an open endpoint lets anyone consume
   * your model account.
   */
  readonly authorize?: (
    request: Request,
  ) => Response | null | Promise<Response | null>;
  /**
   * Per-request admission control (quotas, throttles). Runs after
   * `authorize`. Return `null` to admit, or a `Response` (e.g. 429) to
   * reject.
   */
  readonly rateLimit?: (
    request: Request,
  ) => Response | null | Promise<Response | null>;
  /**
   * Maximum request body size in bytes. Oversized requests get 413.
   * Default 1 MiB — a full conversation with tool schemas fits comfortably.
   */
  readonly maxBodyBytes?: number;
  /**
   * Browser origins allowed to call the endpoint. When set, requests whose
   * `Origin` header is present and not in the list get 403. Same-origin
   * requests (no `Origin` header) always pass.
   */
  readonly allowedOrigins?: readonly string[];
  /**
   * Replaces 5xx error bodies with a generic message so provider/config
   * details never reach clients. Recommended in production. Default false
   * (diagnosable during development).
   */
  readonly redactErrors?: boolean;
}

/** The route handlers returned by {@link createAgentFaceRouteHandler}. */
export interface AgentFaceRouteHandler {
  POST(request: Request): Promise<Response>;
}

const DEFAULT_MAX_BODY_BYTES = 1_048_576;

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
 *   // Production: authenticate and rate-limit — this is a model proxy.
 *   authorize: async (request) =>
 *     (await isSignedIn(request)) ? null : new Response(null, { status: 401 }),
 *   rateLimit: (request) => checkQuota(request),
 *   redactErrors: true,
 * });
 * ```
 */
export function createAgentFaceRouteHandler(
  options: CreateAgentFaceRouteHandlerOptions,
): AgentFaceRouteHandler {
  const endpoint = createModelEndpoint(options.adapter);
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  return {
    async POST(request: Request): Promise<Response> {
      const denied = (await options.authorize?.(request)) ?? null;
      if (denied !== null) {
        return denied;
      }
      const throttled = (await options.rateLimit?.(request)) ?? null;
      if (throttled !== null) {
        return throttled;
      }
      if (options.allowedOrigins !== undefined) {
        const origin = request.headers.get("origin");
        if (origin !== null && !options.allowedOrigins.includes(origin)) {
          return Response.json(
            { error: "Origin not allowed" },
            { status: 403 },
          );
        }
      }

      // Enforce the size cap on the actual bytes, not just the header (a
      // client can lie about Content-Length).
      const declaredLength = Number(request.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
        return Response.json({ error: "Request too large" }, { status: 413 });
      }
      let text: string;
      try {
        text = await request.text();
      } catch {
        return Response.json(
          { error: "Body must be valid JSON" },
          { status: 400 },
        );
      }
      if (new TextEncoder().encode(text).byteLength > maxBodyBytes) {
        return Response.json({ error: "Request too large" }, { status: 413 });
      }
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return Response.json(
          { error: "Body must be valid JSON" },
          { status: 400 },
        );
      }

      const result = await endpoint.handle(body);
      if (options.redactErrors === true && result.status >= 500) {
        return Response.json(
          { error: "The model endpoint failed" },
          { status: result.status },
        );
      }
      return Response.json(result.body, { status: result.status });
    },
  };
}
