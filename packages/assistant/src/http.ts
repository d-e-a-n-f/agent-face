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

  async function post(body: unknown): Promise<Response> {
    return await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...options.headers },
      body: JSON.stringify(body),
    });
  }

  async function parseJson(response: Response): Promise<AgentModelResponse> {
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
  }

  return {
    async complete(request: AgentModelRequest): Promise<AgentModelResponse> {
      return await parseJson(await post(request));
    },

    async completeStream(
      request: AgentModelRequest,
      onTextDelta: (delta: string) => void,
    ): Promise<AgentModelResponse> {
      const response = await post({ ...request, stream: true });
      // Servers (or adapters) without streaming answer with plain JSON —
      // fall back transparently.
      if (
        !(response.headers.get("content-type") ?? "").includes(
          "text/event-stream",
        ) ||
        response.body === null
      ) {
        return await parseJson(response);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let final: AgentModelResponse | undefined;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = rawEvent
            .split("\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => line.slice(6))
            .join("");
          if (data.length === 0) {
            continue;
          }
          const event = JSON.parse(data) as
            | { readonly type: "delta"; readonly text: string }
            | { readonly type: "response"; readonly response: AgentModelResponse }
            | { readonly type: "error"; readonly error: string };
          if (event.type === "delta") {
            onTextDelta(event.text);
          } else if (event.type === "response") {
            final = event.response;
          } else {
            throw new Error(event.error);
          }
        }
      }
      if (final === undefined) {
        throw new Error("Stream ended without a final response");
      }
      return final;
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

/** A streaming endpoint result: SSE bytes, or a JSON fallback/error. */
export type ModelEndpointStreamResult =
  | { readonly kind: "stream"; readonly stream: ReadableStream<Uint8Array> }
  | ({ readonly kind: "json" } & ModelEndpointResult);

/** A framework-neutral model endpoint. Wrap it per framework (Next.js, NestJS, Express, …). */
export interface ModelEndpoint {
  handle(body: unknown): Promise<ModelEndpointResult>;
  /**
   * Streaming variant: when the adapter supports `completeStream`, returns
   * server-sent-event bytes (`data: {"type":"delta"|"response"|"error",…}`
   * frames). Falls back to a JSON result when it does not.
   */
  handleStream(body: unknown): Promise<ModelEndpointStreamResult>;
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
  async function resolveAdapter(): Promise<
    { adapter: AgentModelAdapter } | { error: ModelEndpointResult }
  > {
    try {
      return {
        adapter: typeof source === "function" ? await source() : source,
      };
    } catch (caught) {
      return {
        error: {
          status: 503,
          body: {
            error:
              caught instanceof Error
                ? caught.message
                : "Model adapter is not configured",
          },
        },
      };
    }
  }

  return {
    async handle(body: unknown): Promise<ModelEndpointResult> {
      if (!isModelRequest(body)) {
        return {
          status: 400,
          body: { error: "Body must be an AgentModelRequest" },
        };
      }
      const resolved = await resolveAdapter();
      if ("error" in resolved) {
        return resolved.error;
      }
      try {
        const response = await resolved.adapter.complete(body);
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

    async handleStream(body: unknown): Promise<ModelEndpointStreamResult> {
      if (!isModelRequest(body)) {
        return {
          kind: "json",
          status: 400,
          body: { error: "Body must be an AgentModelRequest" },
        };
      }
      const resolved = await resolveAdapter();
      if ("error" in resolved) {
        return { kind: "json", ...resolved.error };
      }
      const { adapter } = resolved;
      const streamComplete = adapter.completeStream?.bind(adapter);
      if (streamComplete === undefined) {
        // Adapter can't stream: answer with the plain JSON result and let
        // the client's fallback path handle it.
        const result = await this.handle(body);
        return { kind: "json", ...result };
      }
      const encoder = new TextEncoder();
      const frame = (payload: unknown): Uint8Array =>
        encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            const response = await streamComplete(body, (text) => {
              controller.enqueue(frame({ type: "delta", text }));
            });
            controller.enqueue(frame({ type: "response", response }));
          } catch (caught) {
            controller.enqueue(
              frame({
                type: "error",
                error:
                  caught instanceof Error ? caught.message : String(caught),
              }),
            );
          } finally {
            controller.close();
          }
        },
      });
      return { kind: "stream", stream };
    },
  };
}
