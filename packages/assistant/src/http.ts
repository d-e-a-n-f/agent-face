import type { JsonObject } from "@agentface/core";
import type {
  AgentModelAdapter,
  AgentModelRequest,
  AgentModelResponse,
} from "./types.js";

/** The default path where the model endpoint is mounted. */
export const DEFAULT_ASSISTANT_ENDPOINT = "/api/agentface";

/** Options for {@link createHttpModelAdapter}. */
export interface HttpModelAdapterOptions {
  /** Endpoint URL. Default {@link DEFAULT_ASSISTANT_ENDPOINT}. */
  readonly url?: string;
  /** Extra headers (e.g. auth) sent with every completion. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Injectable fetch for tests. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * A browser-safe adapter that forwards completions to a server-side model
 * endpoint (see `createModelEndpoint` / `@agentface/next`). The assistant
 * loop and the runtime stay local; only the JSON-serialisable
 * request/response cross the wire, so provider credentials never reach the
 * browser.
 */
export function createHttpModelAdapter(
  options: HttpModelAdapterOptions = {},
): AgentModelAdapter {
  const url = options.url ?? DEFAULT_ASSISTANT_ENDPOINT;
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async complete(request: AgentModelRequest): Promise<AgentModelResponse> {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...options.headers },
        body: JSON.stringify(request),
      });
      const body = (await response.json()) as
        | AgentModelResponse
        | { readonly error: string };
      if (!response.ok || "error" in body) {
        throw new Error(
          "error" in body
            ? body.error
            : `Assistant endpoint returned HTTP ${response.status}`,
        );
      }
      return body;
    },
  };
}

/** An adapter, or a (possibly async) factory for one — evaluated lazily per request. */
export type ModelAdapterSource =
  | AgentModelAdapter
  | (() => AgentModelAdapter | Promise<AgentModelAdapter>);

/** The framework-neutral result of handling one model-endpoint request. */
export interface ModelEndpointResult {
  readonly status: number;
  readonly body: JsonObject;
}

/** A framework-neutral model endpoint. Wrap it per framework (Next.js, NestJS, Express, …). */
export interface ModelEndpoint {
  handle(body: unknown): Promise<ModelEndpointResult>;
}

function isModelRequest(body: unknown): body is AgentModelRequest {
  return (
    typeof body === "object" &&
    body !== null &&
    typeof (body as AgentModelRequest).system === "string" &&
    Array.isArray((body as AgentModelRequest).messages) &&
    Array.isArray((body as AgentModelRequest).tools)
  );
}

/**
 * The server half of the HTTP adapter, independent of any web framework:
 * validates the request body, resolves the adapter (lazily, so configuration
 * problems surface as 503s rather than boot failures), and runs the
 * completion.
 *
 * Status codes: 400 malformed body, 503 adapter unavailable/misconfigured,
 * 502 completion failure, 200 success.
 *
 * Framework wrappers (like `@agentface/next`) stay thin: parse JSON, call
 * `handle`, serialise the result.
 */
export function createModelEndpoint(source: ModelAdapterSource): ModelEndpoint {
  return {
    async handle(body: unknown): Promise<ModelEndpointResult> {
      if (!isModelRequest(body)) {
        return {
          status: 400,
          body: { error: "Body must be an AgentModelRequest" },
        };
      }
      let adapter: AgentModelAdapter;
      try {
        adapter = typeof source === "function" ? await source() : source;
      } catch (caught) {
        return {
          status: 503,
          body: {
            error:
              caught instanceof Error
                ? caught.message
                : "Model adapter is not configured",
          },
        };
      }
      try {
        const response = await adapter.complete(body);
        return { status: 200, body: response as unknown as JsonObject };
      } catch (caught) {
        return {
          status: 502,
          body: {
            error: caught instanceof Error ? caught.message : String(caught),
          },
        };
      }
    },
  };
}
